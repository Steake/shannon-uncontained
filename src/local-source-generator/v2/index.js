/**
 * LSG v2 - Main entry point
 * 
 * Local Source Generator v2 - World Model First Architecture
 */

// World Model
export { EvidenceGraph, createEvidenceEvent, EVENT_TYPES } from './worldmodel/evidence-graph.js';
export { TargetModel, ENTITY_TYPES, RELATIONSHIP_TYPES, createEndpointEntity } from './worldmodel/target-model.js';
export { ArtifactManifest, VALIDATION_STAGES, createEpistemicEnvelope } from './worldmodel/artifact-manifest.js';

// Epistemics
export {
    EpistemicLedger,
    Claim,
    CLAIM_TYPES,
    ebslOpinion,
    expectedProbability,
    aggregateEvidence,
    fuseEvidenceVectors,
    discountEvidence,
} from './epistemics/ledger.js';

// Orchestrator
import { Orchestrator as _Orchestrator, PipelineStage as _PipelineStage, EXECUTION_MODES as _EXECUTION_MODES } from './orchestrator/scheduler.js';
export { _Orchestrator as Orchestrator, _PipelineStage as PipelineStage, _EXECUTION_MODES as EXECUTION_MODES };
export { StreamingEmitter, DELTA_TYPES, createJSONLinesWriter, createSSEWriter } from './orchestrator/streaming.js';

// Agents
export { BaseAgent, AgentContext, AgentRegistry } from './agents/base-agent.js';

// Recon Agents
import { registerReconAgents as _registerReconAgents, NetReconAgent, CrawlerAgent, TechFingerprinterAgent, JSHarvesterAgent, APIDiscovererAgent, SubdomainHunterAgent } from './agents/recon/index.js';
export { NetReconAgent, CrawlerAgent, TechFingerprinterAgent, JSHarvesterAgent, APIDiscovererAgent, SubdomainHunterAgent, _registerReconAgents as registerReconAgents };

// Tool Runners
export { runTool, runToolWithRetry, isToolAvailable, ToolResult, TOOL_TIMEOUTS } from './tools/runners/tool-runner.js';

// Evidence Normalizers
export {
    normalizeNmap,
    normalizeSubfinder,
    normalizeWhatweb,
    normalizeGau,
    normalizeKatana,
    normalizeHttpx,
} from './tools/normalizers/evidence-normalizers.js';

// LLM Client
export { LLMClient, getLLMClient, LLM_CAPABILITIES } from './orchestrator/llm-client.js';

// Analysis Agents
import { registerAnalysisAgents as _registerAnalysisAgents, ArchitectInferAgent, AuthFlowAnalyzer, DataFlowMapper, VulnHypothesizer, BusinessLogicAgent } from './agents/analysis/index.js';
export { ArchitectInferAgent, AuthFlowAnalyzer, DataFlowMapper, VulnHypothesizer, BusinessLogicAgent, _registerAnalysisAgents as registerAnalysisAgents };

// Synthesis Agents
import { registerSynthesisAgents as _registerSynthesisAgents, SourceGenAgent, SchemaGenAgent, TestGenAgent, DocumentationAgent, GroundTruthAgent } from './agents/synthesis/index.js';
export { SourceGenAgent, SchemaGenAgent, TestGenAgent, DocumentationAgent, GroundTruthAgent, _registerSynthesisAgents as registerSynthesisAgents };

// Exploitation Agents
import { registerExploitationAgents as _registerExploitationAgents, NucleiScanAgent, MetasploitAgent, SQLmapAgent } from './agents/exploitation/index.js';
export { NucleiScanAgent, MetasploitAgent, SQLmapAgent, _registerExploitationAgents as registerExploitationAgents };

// Scaffold Packs
export { EXPRESS_SCAFFOLD, FASTAPI_SCAFFOLD, getScaffold, listScaffolds } from './synthesis/scaffold-packs/index.js';

// Validation Harness
export { ValidationHarness, ValidationResult, emitValidationEvidence } from './synthesis/validators/validation-harness.js';

// Evaluation
export { EvaluationHarness, BenchmarkTarget, MetricCalculator, createStandardCorpus } from './evaluation/harness.js';

/**
 * Create a fully configured LSG v2 instance with all agents
 * @param {object} options - Configuration options
 * @param {string} [options.mode='live'] - Execution mode (live, replay, dry_run)
 * @param {number} [options.maxParallel=4] - Maximum parallel agents
 * @param {boolean} [options.enableCaching=true] - Enable result caching
 * @param {boolean} [options.streamDeltas=true] - Enable delta streaming
 * @param {boolean} [options.enableGitAutomation=false] - Enable git automation for commit/rollback
 * @param {object} [options.epistemicConfig={}] - Epistemic configuration
 * @returns {object} Object containing { orchestrator } - BREAKING CHANGE: Previously returned orchestrator directly
 * 
 * @example
 * // New usage (v2):
 * const { orchestrator } = createLSGv2();
 * 
 * // Old usage (v1 - DEPRECATED):
 * // const orchestrator = createLSGv2();
 */
export function createLSGv2(options = {}) {
    const orchestrator = new _Orchestrator({
        mode: options.mode || 'live',
        maxParallel: options.maxParallel || 4,
        enableCaching: options.enableCaching ?? true,
        streamDeltas: options.streamDeltas ?? true,
        enableGitAutomation: options.enableGitAutomation ?? false,
        epistemicConfig: options.epistemicConfig || {},
    });

    // Register all agents
    _registerReconAgents(orchestrator);
    _registerAnalysisAgents(orchestrator);
    _registerSynthesisAgents(orchestrator);
    _registerExploitationAgents(orchestrator); // NEW: Exploitation phase

    return { orchestrator };
}

/**
 * Version info
 */
export const VERSION = '2.0.0-alpha';
export const ARCHITECTURE = 'world-model-first';

