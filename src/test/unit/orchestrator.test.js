
import { test, describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { Orchestrator, PipelineStage } from '../../local-source-generator/v2/orchestrator/scheduler.js';
import { BaseAgent } from '../../local-source-generator/v2/agents/base-agent.js';

class MockAgent extends BaseAgent {
    constructor(name, shouldFail = false, delay = 0) {
        super(name, { category: 'test' });
        this.shouldFail = shouldFail;
        this.delay = delay;
        this.executionCount = 0;
    }

    async run(ctx, inputs) {
        this.executionCount++;
        if (this.delay) await new Promise(r => setTimeout(r, this.delay));

        if (this.shouldFail) {
            throw new Error(`Agent ${this.name} failed as requested`);
        }

        return {
            success: true,
            data: {
                name: this.name,
                processed: true
            }
        };
    }
}

describe('Orchestrator Unit Tests', () => {

    it('should register and execute a simple agent', async () => {
        const orchestrator = new Orchestrator({ enableCaching: false });
        const agent = new MockAgent('TestAgent');

        orchestrator.registerAgent(agent);

        const result = await orchestrator.executeAgent('TestAgent', { target: 'http://test.com' });

        assert.ok(result.success);
        assert.strictEqual(agent.executionCount, 1);
    });

    it('should handle agent failures gracefully', async () => {
        const orchestrator = new Orchestrator();
        const agent = new MockAgent('FailAgent', true);

        orchestrator.registerAgent(agent);

        const result = await orchestrator.executeAgent('FailAgent', {});

        assert.strictEqual(result.success, false);
        assert.ok(result.error.includes('failed as requested'));
    });

    it('should execute a stage sequentially', async () => {
        const orchestrator = new Orchestrator();
        const agent1 = new MockAgent('Seq1');
        const agent2 = new MockAgent('Seq2');

        orchestrator.registerAgent(agent1);
        orchestrator.registerAgent(agent2);

        const stage = new PipelineStage('seq-stage', ['Seq1', 'Seq2'], { parallel: false });
        const result = await orchestrator.executeStage(stage, {});

        assert.ok(result.success);
        assert.strictEqual(agent1.executionCount, 1);
        assert.strictEqual(agent2.executionCount, 1);
    });

    it('should execute a stage in parallel', async () => {
        const orchestrator = new Orchestrator();
        const agent1 = new MockAgent('Par1', false, 50);
        const agent2 = new MockAgent('Par2', false, 50);

        orchestrator.registerAgent(agent1);
        orchestrator.registerAgent(agent2);

        const stage = new PipelineStage('par-stage', ['Par1', 'Par2'], { parallel: true });

        const start = Date.now();
        const result = await orchestrator.executeStage(stage, {});
        const duration = Date.now() - start;

        assert.ok(result.success);
        // Both take 50ms, parallel execution should be closer to 50ms than 100ms
        // Allowing some overhead buffer
        assert.ok(duration < 150, `Expected parallel execution (took ${duration}ms)`);
    });

    it('should respect excludeAgents option', async () => {
        const orchestrator = new Orchestrator();
        const agent1 = new MockAgent('RunMe');
        const agent2 = new MockAgent('SkipMe');

        orchestrator.registerAgent(agent1);
        orchestrator.registerAgent(agent2);

        const stage = new PipelineStage('exclude-stage', ['RunMe', 'SkipMe']);

        const result = await orchestrator.executeStage(stage, {
            excludeAgents: ['SkipMe']
        });

        assert.ok(result.success);
        assert.strictEqual(agent1.executionCount, 1);
        assert.strictEqual(agent2.executionCount, 0, 'SkipMe should not have executed');
    });

    it('should stop stage execution on failure if required', async () => {
        const orchestrator = new Orchestrator();
        const agent1 = new MockAgent('FailFirst', true);
        const agent2 = new MockAgent('ShouldNotRun');

        orchestrator.registerAgent(agent1);
        orchestrator.registerAgent(agent2);

        const stage = new PipelineStage('required-fail', ['FailFirst', 'ShouldNotRun'], { required: true, parallel: false });

        const result = await orchestrator.executeStage(stage, {});

        assert.strictEqual(result.success, false);
        assert.strictEqual(agent1.executionCount, 1);
        assert.strictEqual(agent2.executionCount, 0);
    });

    it('should continue stage execution on failure if not required', async () => {
        const orchestrator = new Orchestrator();
        const agent1 = new MockAgent('FailOptional', true);
        const agent2 = new MockAgent('RunAnyway');

        orchestrator.registerAgent(agent1);
        orchestrator.registerAgent(agent2);

        const stage = new PipelineStage('optional-fail', ['FailOptional', 'RunAnyway'], { required: false, parallel: false });

        const result = await orchestrator.executeStage(stage, {});

        // Stage success depends on interpretation: 
        // Logic says "success = errors.length === 0 || !stage.required"
        // So overall stage is success (it swallowed the error), but individual result is fail.
        assert.ok(result.success);
        assert.strictEqual(result.errors.length, 1);
        assert.strictEqual(agent1.executionCount, 1);
        assert.strictEqual(agent2.executionCount, 1);
    });
});
