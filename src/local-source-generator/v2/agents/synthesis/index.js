/**
 * Synthesis Agents - Index
 */

import { SourceGenAgent } from './source-gen-agent.js';
import { SchemaGenAgent } from './schema-gen-agent.js';
import { TestGenAgent } from './test-gen-agent.js';
import { DocumentationAgent } from './documentation-agent.js';

export { SourceGenAgent, SchemaGenAgent, TestGenAgent, DocumentationAgent };

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

