/**
 * Synthesis Agents - Index
 */

import { SourceGenAgent } from './source-gen-agent.js';
import { SchemaGenAgent } from './schema-gen-agent.js';
import { TestGenAgent } from './test-gen-agent.js';
import { DocumentationAgent } from './documentation-agent.js';
import { GroundTruthAgent } from './ground-truth-agent.js';
import { BlackboxConfigGenAgent } from './blackbox-config-agent.js';

export { SourceGenAgent, SchemaGenAgent, TestGenAgent, DocumentationAgent, GroundTruthAgent, BlackboxConfigGenAgent };

/**
 * Register all synthesis agents with orchestrator
 * @param {Orchestrator} orchestrator - Orchestrator instance
 */
export function registerSynthesisAgents(orchestrator) {
    orchestrator.registerAgent(new SourceGenAgent());
    orchestrator.registerAgent(new SchemaGenAgent());
    orchestrator.registerAgent(new TestGenAgent());
    orchestrator.registerAgent(new DocumentationAgent());
    orchestrator.registerAgent(new GroundTruthAgent()); // Closed-loop validation
    orchestrator.registerAgent(new BlackboxConfigGenAgent());
}

