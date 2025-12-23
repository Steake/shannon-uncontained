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
            ...options,
        };

        // World model components
        this.evidenceGraph = new EvidenceGraph();
        this.targetModel = new TargetModel();
        this.ledger = new EpistemicLedger(options.epistemicConfig);
        this.manifest = new ArtifactManifest();

        // Agent registry
        this.registry = new AgentRegistry();

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

        // Create context and execute
        const ctx = this.createContext(options.budget || agent.default_budget);
        const result = await agent.execute(ctx, inputs);

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

        if (stage.parallel) {
            // Execute agents in parallel
            const promises = stage.agents.map(async (agentName) => {
                try {
                    const result = await this.executeAgent(agentName, inputs);
                    results[agentName] = result;
                    if (!result.success) {
                        errors.push({ agent: agentName, error: result.error });
                    }
                } catch (err) {
                    errors.push({ agent: agentName, error: err.message });
                }
            });

            await Promise.all(promises);
        } else {
            // Execute agents sequentially
            for (const agentName of stage.agents) {
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
            // Phase 1: Reconnaissance
            new PipelineStage('recon', [
                'NetReconAgent',
                'SubdomainHunterAgent',
                'TechFingerprinterAgent',
                'CrawlerAgent',
                'JSHarvesterAgent',
                'APIDiscovererAgent',
                'ContentDiscoveryAgent',
                'SecretScannerAgent',
                'WAFDetector',
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
            ], { parallel: true, required: false }),

            // Phase 4: Synthesis
            new PipelineStage('synthesis', [
                'GroundTruthAgent',
                'SourceGenAgent',
                'SchemaGenAgent',
                'TestGenAgent',
                'DocumentationAgent',
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

        // Create initial inputs
        const inputs = {
            target,
            outputDir,
            framework: options.framework || 'express',
        };

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
