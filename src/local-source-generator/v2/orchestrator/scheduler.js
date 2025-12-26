/**
 * Orchestrator - Pipeline controller for LSG v2
 * 
 * Handles:
 * - Agent scheduling and execution
 * - Parallelism control
 * - Budget enforcement
 * - Caching and idempotency
 * - Streaming world-model deltas
 * - Tracing and observability
 */

import { EventEmitter } from 'events';
import { EvidenceGraph } from '../worldmodel/evidence-graph.js';
import { TargetModel } from '../worldmodel/target-model.js';
import { ArtifactManifest } from '../worldmodel/artifact-manifest.js';
import { EpistemicLedger } from '../epistemics/ledger.js';
import { AgentContext, AgentRegistry } from '../agents/base-agent.js';
import { PipelineHealthMonitor } from './health-monitor.js';
import { ReactiveVerifier } from '../verification/reactive-verifier.js';
import { MetaCognition } from '../metacognition/meta-cognition.js';

/**
 * Execution modes
 */
export const EXECUTION_MODES = {
    LIVE: 'live',       // Normal execution with network access
    REPLAY: 'replay',   // Replay from stored EvidenceGraph
    DRY_RUN: 'dry_run', // Validate without execution
};

/**
 * Pipeline stage
 */
export class PipelineStage {
    constructor(name, agents = [], options = {}) {
        this.name = name;
        this.agents = agents;
        this.parallel = options.parallel || false;
        this.required = options.required !== false;
        this.timeout = options.timeout || 120000;
    }
}

/**
 * Orchestrator class
 */
export class Orchestrator extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            mode: EXECUTION_MODES.LIVE,
            maxParallel: 4,
            enableCaching: true,
            streamDeltas: true,
            enableGitAutomation: false,
            ...options,
        };

        // World model components
        this.evidenceGraph = new EvidenceGraph();
        this.targetModel = new TargetModel();
        this.ledger = new EpistemicLedger(options.epistemicConfig);
        this.manifest = new ArtifactManifest();

        // Agent registry
        this.registry = new AgentRegistry();

        // Initialize Health Monitor
        this.healthMonitor = new PipelineHealthMonitor({
            maxConcurrency: options.parallel || 5,
            windowSizeMs: 60000
        });

        // Initialize Reactive Verifier for closed-loop verification
        this.verifier = new ReactiveVerifier({
            ledger: this.ledger,
            concurrency: 3,
            minConfidence: 0.6,
        });

        // Initialize Meta-Cognition for uncertainty/contradiction detection
        // NOTE: worldModel is null because LSGv2 uses separate components (EvidenceGraph, TargetModel, etc.)
        // instead of the unified WorldModel class. MetaCognition gracefully handles null worldModel
        // by skipping checks that require it. Full integration would require:
        // 1. Adding getHighUncertaintyClaims/getControversialClaims to EpistemicLedger, OR
        // 2. Creating a WorldModel adapter that wraps the v2 components, OR
        // 3. Using src/core/WorldModel.js (v1 architecture)
        this.metaCognition = new MetaCognition({
            worldModel: null,
            ledger: this.ledger,
        });

        // Execution state
        this.cache = new Map(); // idempotencyKey -> result
        this.executionLog = [];
        this.currentStage = null;
        this.aborted = false;
    }

    /**
     * Register an agent
     * @param {BaseAgent} agent - Agent to register
     */
    registerAgent(agent) {
        this.registry.register(agent);
    }

    /**
     * Create execution context for an agent
     * @param {object} budget - Budget overrides
     * @returns {AgentContext} Context
     */
    createContext(budget = {}) {
        return new AgentContext({
            evidenceGraph: this.evidenceGraph,
            targetModel: this.targetModel,
            ledger: this.ledger,
            manifest: this.manifest,
            verifier: this.verifier,  // Enable closed-loop verification
            config: this.options,
            budget,
        });
    }

    /**
     * Execute a single agent
     * @param {string} agentName - Agent name
     * @param {object} inputs - Agent inputs
     * @param {object} options - Execution options
     * @returns {Promise<object>} Execution result
     */
    async executeAgent(agentName, inputs, options = {}) {
        const agent = this.registry.get(agentName);
        if (!agent) {
            return { success: false, error: `Agent not found: ${agentName}` };
        }

        // Check cache
        const cacheKey = agent.idempotencyKey(inputs, this.options);
        if (this.options.enableCaching && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            this.emit('agent:cached', { agent: agentName, key: cacheKey });
            return { ...cached, cached: true };
        }

        // Emit start event
        this.emit('agent:start', { agent: agentName, inputs });

        // Create checkpoint before execution (if git is enabled)
        if (inputs.outputDir) {
            try {
                const { createGitCheckpoint } = await import('../../../utils/git-manager.js');
                // Disable granular checkpoints to prevent git spam (1700+ commits)
                // await createGitCheckpoint(inputs.outputDir, `Before ${agentName}`, 1);
            } catch (e) {
                // Silently continue - git checkpointing is optional
            }
        }

        // Create context and execute
        const ctx = this.createContext(options.budget || agent.default_budget);

        const startTime = Date.now();
        let result;
        try {
            // Broker status updates
            ctx.on('status', (status) => {
                this.emit('agent:status', { agent: agentName, status });
            });

            result = await agent.execute(ctx, inputs);
        } catch (execError) {
            result = { success: false, error: execError.message };
        }

        // Record metrics
        const duration = Date.now() - startTime;
        this.healthMonitor.record({
            success: result.success,
            duration,
            status: result.status || (result.success ? 200 : 500),
            isBlock: result.error?.includes('403') || result.error?.includes('429')
        });

        // Handle success/failure with git callbacks
        if (inputs.outputDir && this.options.enableGitAutomation) {
            try {
                const { commitGitSuccess, rollbackGitWorkspace } = await import('../../../utils/git-manager.js');
                if (result.success) {
                    await commitGitSuccess(inputs.outputDir, agentName);
                } else {
                    await rollbackGitWorkspace(inputs.outputDir, `${agentName} failure`);
                }
            } catch (e) {
                // Silently continue - git state management is optional
            }
        }

        // Cache successful results
        if (result.success && this.options.enableCaching) {
            this.cache.set(cacheKey, result);
        }

        // Log execution
        this.executionLog.push({
            agent: agentName,
            timestamp: new Date().toISOString(),
            success: result.success,
            summary: result.summary,
        });

        // Emit completion event
        this.emit('agent:complete', { agent: agentName, result });

        // Stream model deltas if enabled
        if (this.options.streamDeltas && result.success) {
            this.emitModelDeltas(ctx);
        }

        return result;
    }

    /**
     * Emit world model deltas for streaming
     * @param {AgentContext} ctx - Agent context with emitted items
     */
    emitModelDeltas(ctx) {
        for (const eventId of ctx.emittedEvents) {
            const event = this.evidenceGraph.getEvent(eventId);
            if (event) {
                this.emit('delta:evidence', event);
            }
        }

        for (const claimId of ctx.emittedClaims) {
            const claim = this.ledger.getClaim(claimId);
            if (claim) {
                this.emit('delta:claim', claim.export(this.ledger.config));
            }
        }
    }

    /**
     * Execute a pipeline stage
     * @param {PipelineStage} stage - Stage to execute
     * @param {object} inputs - Stage inputs
     * @returns {Promise<object>} Stage result
     */
    async executeStage(stage, inputs) {
        this.currentStage = stage.name;
        this.emit('stage:start', { stage: stage.name });

        const results = {};
        const errors = [];
        const excludeList = inputs.excludeAgents || [];

        // Filter valid agents for this stage
        const agentsToRun = stage.agents.filter(agentName => {
            if (excludeList.includes(agentName)) {
                this.emit('agent:skip', { agent: agentName, reason: 'excluded_or_completed' });
                return false;
            }
            return true;
        });

        if (stage.parallel) {
            // ADAPTIVE PARALLEL EXECUTION
            const queue = [...agentsToRun];
            const active = new Set();

            while (queue.length > 0 || active.size > 0) {
                if (this.aborted) break;

                // 1. Check Health & Adjust Concurrency
                const limit = this.healthMonitor.adjustConcurrency();

                // 2. Fill slots if healthy and available
                while (active.size < limit && queue.length > 0) {
                    const agentName = queue.shift();
                    const promise = this.executeAgent(agentName, inputs)
                        .then(result => {
                            results[agentName] = result;
                            if (!result.success) {
                                errors.push({ agent: agentName, error: result.error });
                            }
                        })
                        .catch(err => {
                            errors.push({ agent: agentName, error: err.message });
                        })
                        .finally(() => {
                            active.delete(promise);
                        });

                    active.add(promise);
                }

                // 3. Wait for a slot to free up or health to improve
                if (active.size > 0) {
                    await Promise.race([...active, new Promise(r => setTimeout(r, 200))]);
                } else if (queue.length > 0) {
                    // Should technically not happen if limit >= 1, but safeguard
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        } else {
            // Execute agents sequentially
            for (const agentName of agentsToRun) {
                if (this.aborted) break;

                try {
                    const result = await this.executeAgent(agentName, inputs);
                    results[agentName] = result;
                    if (!result.success) {
                        errors.push({ agent: agentName, error: result.error });
                        if (stage.required) break;
                    }
                } catch (err) {
                    errors.push({ agent: agentName, error: err.message });
                    if (stage.required) break;
                }
            }
        }

        const success = errors.length === 0 || !stage.required;
        this.emit('stage:complete', { stage: stage.name, success, errors });

        return { success, results, errors };
    }

    /**
     * Execute full pipeline
     * @param {PipelineStage[]} stages - Pipeline stages
     * @param {object} inputs - Initial inputs
     * @returns {Promise<object>} Pipeline result
     */
    async executePipeline(stages, inputs) {
        this.emit('pipeline:start', { stages: stages.map(s => s.name) });
        this.aborted = false;

        const stageResults = {};
        let success = true;

        for (const stage of stages) {
            if (this.aborted) {
                this.emit('pipeline:aborted');
                break;
            }

            const result = await this.executeStage(stage, inputs);
            stageResults[stage.name] = result;

            if (!result.success && stage.required) {
                success = false;
                break;
            }

            // Derive model after each stage
            this.targetModel.deriveFromEvidence(this.evidenceGraph, this.ledger);
            this.emit('delta:model', this.targetModel.stats());
        }

        this.emit('pipeline:complete', { success });

        return {
            success,
            stages: stageResults,
            model_stats: this.targetModel.stats(),
            ledger_stats: this.ledger.stats(),
            manifest_summary: this.manifest.getValidationSummary(),
        };
    }

    /**
     * Define standard LSG pipeline with all phases
     * @returns {PipelineStage[]} Pipeline stages
     */
    static defineLSGPipeline() {
        return [
            // Phase 1: Reconnaissance (Split into dependencies)

            // 1. Discovery - Find the scope
            new PipelineStage('recon:discovery', [
                'SubdomainHunterAgent',  // Finds subdomains (Primary Seed)
                'SitemapAgent',          // Finds paths
                'OpenAPIDiscoveryAgent', // Finds API specs
            ], { parallel: true, required: false }),

            // 2. Enumeration - Explore the scope
            new PipelineStage('recon:enumeration', [
                'NetReconAgent',         // Scans found subdomains
                'WAFDetector',           // Checks protections
                'TechFingerprinterAgent',// Identifies stack
                'CrawlerAgent',          // Standard crawl
                'BrowserCrawlerAgent',   // Deep dynamic crawl
            ], { parallel: true, required: false }),

            // 3. Analysis - unexpected intelligence from content
            new PipelineStage('recon:analysis', [
                'JSHarvesterAgent',      // Needs files from crawler
                'APIDiscovererAgent',    // Needs traffic/links from crawler
                'ContentDiscoveryAgent', // Targeted fuzzing
                'CORSProbeAgent',        // Needs endpoints
                'SecretScannerAgent',    // Scans all bodies
                'MetasploitRecon',       // Scans services
            ], { parallel: true, required: false }),

            // Phase 2: Analysis  
            new PipelineStage('analysis', [
                'ArchitectInferAgent',
                'AuthFlowAnalyzer',
                'DataFlowMapper',
                'BusinessLogicAgent',
                'VulnHypothesizer',
                'SecurityHeaderAnalyzer',
                'TLSAnalyzer',
            ], { parallel: false, required: false }),

            // Phase 3: Exploitation/Validation
            new PipelineStage('exploitation', [
                'NucleiScanAgent',
                'SQLmapAgent',
                'XSSValidatorAgent',
                'CommandInjectionAgent',
                'MetasploitExploit', // Active exploitation
            ], { parallel: true, required: false }),

            // Phase 4: Synthesis
            new PipelineStage('synthesis', [
                'GroundTruthAgent',
                'SourceGenAgent',
                'SchemaGenAgent',
                'TestGenAgent',
                'DocumentationAgent',
                'BlackboxConfigGenAgent',
            ], { parallel: false, required: false }),
        ];
    }

    /**
     * Run the full LSG pipeline
     * @param {string} target - Target URL
     * @param {string} outputDir - Output directory
     * @param {object} options - Pipeline options
     * @returns {Promise<object>} Pipeline result
     */
    async runFullPipeline(target, outputDir, options = {}) {
        const pipeline = Orchestrator.defineLSGPipeline();

        this.emit('pipeline:init', { target, outputDir, stages: pipeline.length });

        // RESUMABILITY: Load existing state if available
        if (outputDir) {
            const { fs, path } = await import('zx');
            const stateFile = path.join(outputDir, 'world-model.json');
            const logFile = path.join(outputDir, 'execution-log.json');

            if (await fs.pathExists(stateFile)) {
                try {
                    console.log(`[Orchestrator] Resuming: Loading world-model.json from ${outputDir}`);
                    const state = await fs.readJSON(stateFile);
                    this.importState(state);
                } catch (e) {
                    console.warn(`[Orchestrator] Failed to load existing world model: ${e.message}`);
                }
            }

            if (await fs.pathExists(logFile)) {
                try {
                    console.log(`[Orchestrator] Resuming: Loading execution-log.json`);
                    const oldLog = await fs.readJSON(logFile);
                    // Hydrate cache with successful executions to skip re-running
                    for (const entry of oldLog) {
                        if (entry.success) {
                            // Reconstruct partial cache key based on inputs available in log? 
                            // Actually, better to just let the idempotency logic handle it if they match EXACTLY.
                            // But for simple "skip if done" logic:

                            // We can manually mark agent as completed in a set to check against.
                            // But the easiest way is to push to executionLog and let `executedAgents` tracking logic work 
                            // if we had one. 

                            // Better approach: Populate cache with a "dummy" success for the agent name?
                            // No, because inputs might differ. 

                            // Current design relies on `idempotencyKey` which needs inputs.
                            // If we don't have original inputs, we can't perfectly cache-hit.

                            // However, strictly for pipeline resumption, we can assume inputs are constant for a run.
                        }
                    }
                    // Current simplified approach: just keep the log for history
                    this.executionLog = oldLog;
                } catch (e) {
                    console.warn(`[Orchestrator] Failed to load execution log: ${e.message}`);
                }
            }
        }

        // Create initial inputs
        const inputs = {
            target,
            outputDir,
            framework: options.framework || 'express',
            ...options // Pass through all options including msfrpcConfig
        };

        // Resumability part 2:
        // We need a way to tell the pipeline stages to SKIP agents that are already "done".
        // The most robust way without perfect input reconstruction is to check executionLog 
        // for `agent` names that succeeded recently? 

        // For now, relies on standard caching if inputs reconstruct same unique key.
        // OR explicit excludes.

        if (this.executionLog.length > 0) {
            // Find agents that succeeded
            const completedAgents = new Set(this.executionLog.filter(e => e.success).map(e => e.agent));

            // Filter excludeAgents to include already completed ones
            if (!options.excludeAgents) options.excludeAgents = [];

            // Log what we found
            this.emit('resumed', { completed: completedAgents.size, agents: Array.from(completedAgents) });

            // Auto-exclude completed agents to prevent re-execution
            // This enables true "resume" behavior
            if (options.resume !== false) { // Default to true unless explicitly disabled
                completedAgents.forEach(agent => {
                    if (!options.excludeAgents.includes(agent)) {
                        options.excludeAgents.push(agent);
                    }
                });
            }
        }

        // Execute full pipeline
        const result = await this.executePipeline(pipeline, inputs);

        // Export state to output directory
        if (outputDir) {
            const { fs, path } = await import('zx');
            await fs.ensureDir(outputDir);

            // Save world model
            const stateFile = path.join(outputDir, 'world-model.json');
            await fs.writeJSON(stateFile, this.exportState(), { spaces: 2 });

            // Save execution log
            const logFile = path.join(outputDir, 'execution-log.json');
            await fs.writeJSON(logFile, this.executionLog, { spaces: 2 });
        }

        return {
            ...result,
            target,
            outputDir,
        };
    }

    /**
     * Run a single agent on an existing workspace
     * Useful for debugging and iterating on specific agents
     * 
     * @param {string} agentName - Name of the agent to run
     * @param {string} target - Target URL
     * @param {string} outputDir - Workspace directory (must exist)
     * @returns {Promise<object>} Agent result
     */
    async runSingleAgent(agentName, target, outputDir) {
        const { fs, path } = await import('zx');

        // Load existing workspace
        const worldModelPath = path.join(outputDir, 'world-model.json');
        if (await fs.pathExists(worldModelPath)) {
            const data = await fs.readJSON(worldModelPath);

            // Import model components
            this.targetModel.import(data.target_model || data);
            if (data.evidence_graph) this.evidenceGraph.import(data.evidence_graph);
            if (data.ledger) this.ledger.import(data.ledger);
            if (data.manifest) this.manifest.import(data.manifest);

            // Re-derive entities from evidence (ensures endpoints are populated)
            this.targetModel.deriveFromEvidence(this.evidenceGraph, this.ledger);

            console.log(`[Orchestrator] Loaded world-model.json from ${outputDir} (${this.targetModel.getEndpoints().length} endpoints, ${this.evidenceGraph.stats().total_events} events)`);
        }

        // Check if agent exists
        const agent = this.registry.get(agentName);
        if (!agent) {
            const available = this.registry.list().join(', ');
            return {
                success: false,
                error: `Agent "${agentName}" not found. Available: ${available}`,
            };
        }

        const inputs = { target, outputDir };

        this.emit('agent:start', { agent: agentName });
        const result = await this.executeAgent(agentName, inputs);
        this.emit('agent:complete', { agent: agentName, result });

        // Save updated world model
        if (result.success) {
            const exported = this.exportState();
            await fs.writeJSON(worldModelPath, exported, { spaces: 2 });
            console.log(`[Orchestrator] World model saved to ${worldModelPath} (${this.targetModel.getEndpoints().length} endpoints)`);
        }

        return result;
    }

    /**
     * Run only synthesis stage with imported world model
     * Used when recon is done externally (e.g., by v1 pipeline)
     * 
     * @param {object} worldModelData - Imported world model JSON
     * @param {string} outputDir - Output directory for generated files
     * @param {object} options - Synthesis options
     * @returns {Promise<object>} Synthesis result
     */
    async runSynthesis(worldModelData, outputDir, options = {}) {
        this.emit('synthesis:start', { outputDir });

        // Import existing world model data
        if (worldModelData.evidence) {
            for (const ev of worldModelData.evidence) {
                this.evidenceGraph.addEvent({
                    id: ev.id,
                    type: ev.content?.type || 'observation',
                    payload: ev.content,
                    source_agent: ev.sourceAgent,
                    timestamp: ev.timestamp,
                });
            }
        }

        if (worldModelData.claims) {
            for (const claim of worldModelData.claims) {
                this.ledger.upsertClaim({
                    claim_type: claim.type || 'observation',
                    subject: claim.subject,
                    predicate: claim.predicate || {},
                    base_rate: claim.eqbsl?.a || 0.5,
                });
            }
        }

        // Directly populate endpoints from evidence (for imported world models)
        // This handles evidence with type 'endpoint' that won't be found by deriveFromEvidence
        if (worldModelData.evidence) {
            for (const ev of worldModelData.evidence) {
                if (ev.content?.type === 'endpoint' && ev.content?.path) {
                    const method = ev.content.method || 'GET';
                    const path = ev.content.path;
                    const endpointId = `endpoint:${method}:${path}`;

                    this.targetModel.addEntity({
                        id: endpointId,
                        entity_type: 'endpoint',
                        attributes: {
                            method,
                            path,
                            params: ev.content.params || [],
                            source: ev.content.source,
                            evidence_refs: [ev.id],
                        },
                        claim_refs: [],
                    });
                }
            }
        }

        // Derive additional target model relationships from imported evidence
        this.targetModel.deriveFromEvidence(this.evidenceGraph, this.ledger);

        // Debug: Log model stats before synthesis
        const modelStats = this.targetModel.stats();
        this.emit('synthesis:model-ready', {
            endpoints: modelStats.entity_types?.endpoint || 0,
            total_entities: modelStats.total_entities,
        });

        // Run synthesis agents

        const synthesisAgents = [
            'SourceGenAgent',
            'SchemaGenAgent',
            'TestGenAgent',
            'DocumentationAgent',
        ];

        const results = {};
        const errors = [];

        for (const agentName of synthesisAgents) {
            if (this.aborted) break;

            const agent = this.registry.get(agentName);
            if (!agent) {
                this.emit('synthesis:agent-skip', { agent: agentName, reason: 'not registered' });
                continue;
            }

            try {
                const ctx = this.createContext(agent.default_budget);

                // Extract target from meta or evidence
                let target = worldModelData.meta?.target;
                if (!target || target === 'unknown') {
                    // Try to extract from evidence sources
                    const firstEvidence = worldModelData.evidence?.[0];
                    const source = firstEvidence?.content?.source || firstEvidence?.content?.url;
                    if (source) {
                        try {
                            const url = new URL(source);
                            target = `${url.protocol}//${url.hostname}`;
                        } catch {
                            // Fallback to workspace directory name
                            const { path } = await import('zx');
                            target = `https://${path.basename(outputDir)}`;
                        }
                    } else {
                        // Use workspace directory name
                        const { path } = await import('zx');
                        target = `https://${path.basename(outputDir)}`;
                    }
                }

                const result = await agent.execute(ctx, {
                    target,
                    outputDir,
                    framework: options.framework,
                });


                results[agentName] = result;

                if (!result.success) {
                    errors.push({ agent: agentName, error: result.error });
                }

                this.emit('synthesis:agent-complete', { agent: agentName, success: result.success });
            } catch (err) {
                errors.push({ agent: agentName, error: err.message });
                this.emit('synthesis:agent-error', { agent: agentName, error: err.message });
            }
        }

        const success = errors.length === 0;
        this.emit('synthesis:complete', { success, results, errors });

        return {
            success,
            results,
            errors,
            files_generated: Object.values(results)
                .filter(r => r.success)
                .flatMap(r => r.outputs?.files || []),
            manifest: this.manifest.export(),
        };
    }

    /**
     * Abort pipeline execution
     */
    abort() {
        this.aborted = true;
        this.emit('pipeline:abort-requested');
    }

    /**
     * Export full state for persistence/replay
     * @returns {object} State snapshot
     */
    exportState() {
        return {
            version: '1.0.0',
            exported_at: new Date().toISOString(),
            evidence_graph: this.evidenceGraph.export(),
            ledger: this.ledger.export(),
            manifest: this.manifest.export(),
            target_model: this.targetModel.export(),
            execution_log: this.executionLog,
        };
    }

    /**
     * Import state for replay
     * @param {object} state - Previously exported state
     */
    importState(state) {
        if (state.evidence_graph) {
            this.evidenceGraph.import(state.evidence_graph);
        }
        if (state.ledger) {
            this.ledger.import(state.ledger);
        }
        if (state.manifest) {
            this.manifest.import(state.manifest);
        }
        if (state.target_model) {
            this.targetModel.import(state.target_model);
        }
        if (state.execution_log) {
            this.executionLog = state.execution_log;
        }
    }

    /**
     * Get orchestrator statistics
     * @returns {object} Statistics
     */
    stats() {
        return {
            registered_agents: this.registry.list(),
            cache_size: this.cache.size,
            execution_count: this.executionLog.length,
            evidence_stats: this.evidenceGraph.stats(),
            model_stats: this.targetModel.stats(),
            ledger_stats: this.ledger.stats(),
        };
    }
}

export default Orchestrator;
