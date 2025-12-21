/**
 * Analysis Agents - Index
 */

import { ArchitectInferAgent } from './architect-infer-agent.js';
import { AuthFlowAnalyzer } from './auth-flow-analyzer.js';
import { DataFlowMapper } from './data-flow-mapper.js';
import { VulnHypothesizer } from './vuln-hypothesizer.js';
import { BusinessLogicAgent } from './business-logic-agent.js';

export { ArchitectInferAgent, AuthFlowAnalyzer, DataFlowMapper, VulnHypothesizer, BusinessLogicAgent };

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

