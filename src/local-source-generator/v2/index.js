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

// Evaluation
export { EvaluationHarness, BenchmarkTarget, MetricCalculator, createStandardCorpus } from './evaluation/harness.js';

/**
 * Create a fully configured LSG v2 instance
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

    return orchestrator;
}

/**
 * Version info
 */
export const VERSION = '2.0.0-alpha';
export const ARCHITECTURE = 'world-model-first';
