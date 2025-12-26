/**
 * Tests for Orchestrator/Scheduler v2
 * 
 * Run with: node --test src/local-source-generator/tests/scheduler.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { Orchestrator, PipelineStage } from '../v2/orchestrator/scheduler.js';
import { AgentRegistry, BaseAgent } from '../v2/agents/base-agent.js';

// Mock agent for testing
class MockAgent extends BaseAgent {
    constructor(name = 'MockAgent') {
        super(name, {
            description: 'Mock agent for testing',
            version: '1.0.0',
        });
        this.runCalled = false;
        this.runInputs = null;
    }

    async run(inputs, ctx) {
        this.runCalled = true;
        this.runInputs = inputs;
        return { success: true, data: { test: 'result' } };
    }
}

describe('PipelineStage', () => {
    test('should create stage with default options', () => {
        const stage = new PipelineStage('test-stage', ['Agent1', 'Agent2']);

        assert.equal(stage.name, 'test-stage');
        assert.deepEqual(stage.agents, ['Agent1', 'Agent2']);
        assert.equal(stage.parallel, false);
        assert.equal(stage.required, true);
        assert.equal(stage.timeout, 120000);
    });

    test('should create stage with custom options', () => {
        const stage = new PipelineStage('parallel-stage', ['A', 'B'], {
            parallel: true,
            required: false,
            timeout: 60000,
        });

        assert.equal(stage.parallel, true);
        assert.equal(stage.required, false);
        assert.equal(stage.timeout, 60000);
    });
});

describe('AgentRegistry', () => {
    test('should register and retrieve agents', () => {
        const registry = new AgentRegistry();
        const agent = new MockAgent('TestAgent');

        registry.register(agent);

        assert.equal(registry.get('TestAgent'), agent);
        assert.equal(registry.get('NonExistent'), null);
    });

    test('should list all registered agents', () => {
        const registry = new AgentRegistry();
        registry.register(new MockAgent('Agent1'));
        registry.register(new MockAgent('Agent2'));

        const list = registry.list();

        assert.deepEqual(list, ['Agent1', 'Agent2']);
    });

    test('should return contracts for all agents', () => {
        const registry = new AgentRegistry();
        registry.register(new MockAgent('Agent1'));

        const contracts = registry.getContracts();

        assert.equal(contracts.length, 1);
        assert.equal(contracts[0].name, 'Agent1');
    });
});

describe('Orchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        orchestrator = new Orchestrator({
            mode: 'live',
            maxParallel: 2,
        });
    });

    describe('registerAgent', () => {
        test('should register agents via registerAgent method', () => {
            const agent = new MockAgent('TestAgent');
            orchestrator.registerAgent(agent);

            const retrieved = orchestrator.registry.get('TestAgent');
            assert.equal(retrieved, agent);
        });
    });

    describe('createContext', () => {
        test('should create context with all required properties', () => {
            const ctx = orchestrator.createContext();

            assert.ok(ctx.evidenceGraph, 'Should have evidenceGraph');
            assert.ok(ctx.targetModel, 'Should have targetModel');
            assert.ok(ctx.ledger, 'Should have ledger');
            assert.ok(typeof ctx.recordTokens === 'function', 'Should have recordTokens method');
            assert.ok(typeof ctx.emit === 'function', 'Should have emit method');
        });

        test('should merge budget overrides', () => {
            const ctx = orchestrator.createContext({
                max_tokens: 5000,
            });

            assert.equal(ctx.budget.max_tokens, 5000);
        });
    });

    describe('runSingleAgent', () => {
        test('should return error for non-existent agent', async () => {
            const result = await orchestrator.runSingleAgent(
                'NonExistentAgent',
                'https://example.com',
                './test-workspace-nonexistent'
            );

            assert.equal(result.success, false);
            assert.ok(result.error.includes('not found'));
            assert.ok(result.error.includes('Available:'));
        });

        test('should run registered agent successfully', async () => {
            const agent = new MockAgent('TestAgent');
            orchestrator.registerAgent(agent);

            const tempDir = `./test-workspace-${Date.now()}`;
            const { mkdir, rm, writeFile } = await import('node:fs/promises');

            await mkdir(tempDir, { recursive: true });

            try {
                // Ensure world-model.json exists so load doesn't crash if it tries to read it
                await writeFile(`${tempDir}/world-model.json`, JSON.stringify({
                    entities: [],
                    evidence_graph: { events: [] }
                }));

                const result = await orchestrator.runSingleAgent(
                    'TestAgent',
                    'https://example.com',
                    tempDir
                );

                assert.equal(result.success, true);
                assert.equal(agent.runCalled, true);
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        });

        test('should emit agent:start and agent:complete events', async () => {
            const agent = new MockAgent('TestAgent');
            orchestrator.registerAgent(agent);

            const tempDir = `./test-workspace-events-${Date.now()}`;
            const { mkdir, rm, writeFile } = await import('node:fs/promises');
            await mkdir(tempDir, { recursive: true });

            try {
                await writeFile(`${tempDir}/world-model.json`, JSON.stringify({
                    entities: [],
                    evidence_graph: { events: [] }
                }));

                let startEmitted = false;
                let completeEmitted = false;

                orchestrator.on('agent:start', ({ agent: name }) => {
                    startEmitted = true;
                    assert.equal(name, 'TestAgent');
                });

                orchestrator.on('agent:complete', ({ agent: name, result }) => {
                    completeEmitted = true;
                    assert.equal(name, 'TestAgent');
                    assert.equal(result.success, true);
                });

                await orchestrator.runSingleAgent(
                    'TestAgent',
                    'https://example.com',
                    tempDir
                );

                assert.equal(startEmitted, true);
                assert.equal(completeEmitted, true);
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        });
    });

    describe('stats', () => {
        test('should return orchestrator statistics', () => {
            const stats = orchestrator.stats();

            assert.ok('registered_agents' in stats || 'mode' in stats);
            assert.ok('model_stats' in stats);
            assert.ok('ledger_stats' in stats);
        });
    });

    describe('exportState / importState', () => {
        test('should export and import state correctly', () => {
            // Add some data to the model
            orchestrator.targetModel.addEntity({
                id: 'test-entity',
                entity_type: 'endpoint',
                attributes: { path: '/api/test' },
            });

            const exported = orchestrator.exportState();

            assert.ok(exported.target_model);
            assert.ok(exported.exported_at);

            // Create new orchestrator and import
            const newOrchestrator = new Orchestrator();
            newOrchestrator.importState(exported);

            const entity = newOrchestrator.targetModel.getEntity('test-entity');
            assert.ok(entity);
            assert.equal(entity.attributes.path, '/api/test');
        });
    });
});
