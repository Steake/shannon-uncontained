
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { fs, path } from 'zx';
import { Orchestrator, PipelineStage } from '../../local-source-generator/v2/orchestrator/scheduler.js';
import { BaseAgent } from '../../local-source-generator/v2/agents/base-agent.js';

const TEST_DIR = path.join(process.cwd(), 'src/test/temp/persistence');

class MockAgent extends BaseAgent {
    constructor(name) {
        super(name);
    }
    async run(ctx, inputs) {
        ctx.emitEvidence({ type: 'test_evidence', content: 'data' });
        return { success: true, data: 'done' };
    }
}

describe('Orchestrator Persistence & Resume Integration', () => {

    before(async () => {
        await fs.ensureDir(TEST_DIR);
        await fs.emptyDir(TEST_DIR);
    });

    after(async () => {
        await fs.remove(TEST_DIR);
    });

    it('should save state to disk after execution', async () => {
        const orchestrator = new Orchestrator();
        orchestrator.registerAgent(new MockAgent('AgentA'));

        // Define mini pipeline
        const stage = new PipelineStage('test-stage', ['AgentA']);
        const pipeline = [stage];

        // Mocking runFullPipeline internals basically, or just using executePipeline and manual export
        // For integration, let's use the public runFullPipeline if possible, but we need to mock defineLSGPipeline?
        // Or just trust executePipeline + manual exportLogic for unit test stability.

        // Let's use executePipeline + exportState to simulate what runFullPipeline does
        await orchestrator.executePipeline(pipeline, { outputDir: TEST_DIR });

        // Manually trigger save (like runFullPipeline does)
        const state = orchestrator.exportState();
        await fs.writeJSON(path.join(TEST_DIR, 'world-model.json'), state);
        await fs.writeJSON(path.join(TEST_DIR, 'execution-log.json'), orchestrator.executionLog);

        // Verify files exist
        assert.ok(await fs.pathExists(path.join(TEST_DIR, 'world-model.json')));
        assert.ok(await fs.pathExists(path.join(TEST_DIR, 'execution-log.json')));
    });

    it('should load state and identifying completed agents', async () => {
        // Create NEW orchestrator instance to simulate restart
        const orchestrator = new Orchestrator();
        orchestrator.registerAgent(new MockAgent('AgentA'));
        orchestrator.registerAgent(new MockAgent('AgentB'));

        // Load state
        const state = await fs.readJSON(path.join(TEST_DIR, 'world-model.json'));
        const log = await fs.readJSON(path.join(TEST_DIR, 'execution-log.json'));

        orchestrator.importState(state);
        orchestrator.executionLog = log; // Manual hydration as per scheduler logic

        // Verify state loaded
        assert.strictEqual(orchestrator.evidenceGraph.events.size, 1, 'Should have loaded 1 event from AgentA');

        // Verify resume logic detection
        const completedAgents = new Set(orchestrator.executionLog.filter(e => e.success).map(e => e.agent));
        assert.ok(completedAgents.has('AgentA'));
        assert.ok(!completedAgents.has('AgentB'));
    });
});
