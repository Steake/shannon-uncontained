/**
 * Synthesis Agents - Index
 */

export { SourceGenAgent } from './source-gen-agent.js';
export { SchemaGenAgent } from './schema-gen-agent.js';
export { TestGenAgent } from './test-gen-agent.js';
export { DocumentationAgent } from './documentation-agent.js';

/**
 * Register all synthesis agents with orchestrator
 * @param {Orchestrator} orchestrator - Orchestrator instance
 */
export function registerSynthesisAgents(orchestrator) {
    orchestrator.registerAgent(new SourceGenAgent());
    orchestrator.registerAgent(new SchemaGenAgent());
    orchestrator.registerAgent(new TestGenAgent());
    orchestrator.registerAgent(new DocumentationAgent());
}
