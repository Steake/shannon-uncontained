/**
 * Analysis Agents - Index
 */

export { ArchitectInferAgent } from './architect-infer-agent.js';
export { AuthFlowAnalyzer } from './auth-flow-analyzer.js';
export { DataFlowMapper } from './data-flow-mapper.js';
export { VulnHypothesizer } from './vuln-hypothesizer.js';
export { BusinessLogicAgent } from './business-logic-agent.js';

/**
 * Register all analysis agents with orchestrator
 * @param {Orchestrator} orchestrator - Orchestrator instance
 */
export function registerAnalysisAgents(orchestrator) {
    orchestrator.registerAgent(new ArchitectInferAgent());
    orchestrator.registerAgent(new AuthFlowAnalyzer());
    orchestrator.registerAgent(new DataFlowMapper());
    orchestrator.registerAgent(new VulnHypothesizer());
    orchestrator.registerAgent(new BusinessLogicAgent());
}
