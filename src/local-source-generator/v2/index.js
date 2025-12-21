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
export { Orchestrator, PipelineStage, EXECUTION_MODES } from './orchestrator/scheduler.js';
export { StreamingEmitter, DELTA_TYPES, createJSONLinesWriter, createSSEWriter } from './orchestrator/streaming.js';

// Agents
export { BaseAgent, AgentContext, AgentRegistry } from './agents/base-agent.js';

// Recon Agents
export {
    NetReconAgent,
    CrawlerAgent,
    TechFingerprinterAgent,
    JSHarvesterAgent,
    APIDiscovererAgent,
    SubdomainHunterAgent,
    registerReconAgents,
} from './agents/recon/index.js';

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
export {
    ArchitectInferAgent,
    AuthFlowAnalyzer,
    DataFlowMapper,
    VulnHypothesizer,
    BusinessLogicAgent,
    registerAnalysisAgents,
} from './agents/analysis/index.js';

// Synthesis Agents
export {
    SourceGenAgent,
    SchemaGenAgent,
    TestGenAgent,
    DocumentationAgent,
    registerSynthesisAgents,
} from './agents/synthesis/index.js';

// Scaffold Packs
export { EXPRESS_SCAFFOLD, FASTAPI_SCAFFOLD, getScaffold, listScaffolds } from './synthesis/scaffold-packs/index.js';

// Validation Harness
export { ValidationHarness, ValidationResult, emitValidationEvidence } from './synthesis/validators/validation-harness.js';

// Evaluation
export { EvaluationHarness, BenchmarkTarget, MetricCalculator, createStandardCorpus } from './evaluation/harness.js';

/**
 * Create a fully configured LSG v2 instance with all agents
 * @param {object} options - Configuration options
 * @returns {Orchestrator} Configured orchestrator
 */
export function createLSGv2(options = {}) {
    const orchestrator = new Orchestrator({
        mode: options.mode || 'live',
        maxParallel: options.maxParallel || 4,
        enableCaching: options.enableCaching !== false,
        streamDeltas: options.streamDeltas !== false,
        epistemicConfig: options.epistemicConfig || {},
    });

    // Register all agents
    registerReconAgents(orchestrator);
    registerAnalysisAgents(orchestrator);
    registerSynthesisAgents(orchestrator);

    return orchestrator;
}

/**
 * Version info
 */
export const VERSION = '2.0.0-alpha';
export const ARCHITECTURE = 'world-model-first';

