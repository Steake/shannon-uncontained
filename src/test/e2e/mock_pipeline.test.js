
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { fs, path } from 'zx';
import { Orchestrator, PipelineStage } from '../../local-source-generator/v2/orchestrator/scheduler.js';
import { BaseAgent } from '../../local-source-generator/v2/agents/base-agent.js';

const TEST_DIR = path.join(process.cwd(), 'src/test/temp/e2e');

// Mock Agents for each Phase
class MockRecon extends BaseAgent {
    constructor() { super('NetReconAgent'); }
    async run(ctx, inputs) {
        ctx.emitEvidence({ type: 'port_scan', content: { ports: [80, 443] } });
        return { success: true, data: { status: 'open' } };
    }
}

class MockAnalysis extends BaseAgent {
    constructor() { super('VulnHypothesizer'); }
    async run(ctx, inputs) {
        // Pretend we found a vuln based on evidence
        ctx.emitEvidence({ type: 'vuln_hypothesis', content: { type: 'sqli', severity: 'high' } });
        return { success: true, data: { vulns: ['sqli'] } };
    }
}

class MockExploit extends BaseAgent {
    constructor() { super('NucleiScanAgent'); } // Mimic nuclei
    async run(ctx, inputs) {
        ctx.emitClaim({
            subject: 'target',
            predicate: { type: 'vulnerability', name: 'sqli', confirmed: true },
            base_rate: 0.9
        });
        return { success: true, data: { confirmed: true } };
    }
}

class MockSynthesis extends BaseAgent {
    constructor() { super('DocumentationAgent'); }
    async run(ctx, inputs) {
        return { success: true, outputs: { files: ['report.md'] } };
    }
}

describe('System E2E: Full Pipeline Mock', () => {

    before(async () => {
        await fs.ensureDir(TEST_DIR);
        await fs.emptyDir(TEST_DIR);
    });

    after(async () => {
        await fs.remove(TEST_DIR);
    });

    it('should execute full 4-phase lifecycle successfully', async () => {
        const orchestrator = new Orchestrator({ mode: 'dry_run' });

        // Register mocks, overwriting any real agents if they were auto-loaded (they aren't here)
        orchestrator.registerAgent(new MockRecon());
        orchestrator.registerAgent(new MockAnalysis());
        orchestrator.registerAgent(new MockExploit());
        orchestrator.registerAgent(new MockSynthesis());

        // Define a custom mock pipeline that matches the LSG phases in names
        const mockPipeline = [
            new PipelineStage('recon', ['NetReconAgent']),
            new PipelineStage('analysis', ['VulnHypothesizer']),
            new PipelineStage('exploitation', ['NucleiScanAgent']),
            new PipelineStage('synthesis', ['DocumentationAgent'])
        ];

        // Hack: Override defineLSGPipeline dynamically or just use executePipeline directly
        // runFullPipeline calls defineLSGPipeline static method. 
        // We can't easily mock static method without proxys. 
        // So we will verify executePipeline directly, which is what runFullPipeline calls anyway.
        // But to truly test runFullPipeline we would need to mock the defineLSGPipeline return.

        // Let's just use executePipeline with our mock agents for the E2E verification of the engine logic flow
        // because we want to test THE ENGINE flow, not the hardcoded list of agents.

        const inputs = {
            target: 'https://mock-target.com',
            outputDir: TEST_DIR,
            framework: 'express'
        };

        const result = await orchestrator.executePipeline(mockPipeline, inputs);

        // Assertions
        assert.ok(result.success, 'Pipeline should match success');
        assert.strictEqual(result.stages['recon'].success, true);
        assert.strictEqual(result.stages['analysis'].success, true);
        assert.strictEqual(result.stages['exploitation'].success, true);
        assert.strictEqual(result.stages['synthesis'].success, true);

        // Check artifacts
        // Since we are not using runFullPipeline, specific export steps might not happen automatically 
        // unless we call the Orchestrator persistence methods.
        orchestrator.exportState();

        // Verify evidence flow
        const events = orchestrator.evidenceGraph.getAllEvents();
        assert.ok(events.some(e => e.type === 'port_scan'), 'Should have port scan evidence');
        assert.ok(events.some(e => e.type === 'vuln_hypothesis'), 'Should have vuln hypothesis');

        // Verify ledger flow
        const claims = Array.from(orchestrator.ledger.claims.values());
        assert.ok(claims.some(c => c.predicate.name === 'sqli'), 'Should have confirmed SQLi claim');
    });
});
