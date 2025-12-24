#!/usr/bin/env node
/**
 * LSG v2 Comprehensive Test Suite
 * 
 * Tests all agents and infrastructure components.
 */

import {
    // World Model
    EvidenceGraph, createEvidenceEvent, EVENT_TYPES,
    TargetModel, ENTITY_TYPES, RELATIONSHIP_TYPES, createEndpointEntity,
    ArtifactManifest, VALIDATION_STAGES, createEpistemicEnvelope,

    // Epistemics
    EpistemicLedger, Claim, CLAIM_TYPES, ebslOpinion, expectedProbability,
    aggregateEvidence, fuseEvidenceVectors, discountEvidence,

    // Orchestrator
    Orchestrator, PipelineStage, EXECUTION_MODES,
    StreamingEmitter, DELTA_TYPES,
    LLMClient, getLLMClient, LLM_CAPABILITIES,

    // Agents
    BaseAgent, AgentContext, AgentRegistry,

    // Tool Runners
    runTool, isToolAvailable, ToolResult, TOOL_TIMEOUTS,

    // Scaffolds
    EXPRESS_SCAFFOLD, FASTAPI_SCAFFOLD, getScaffold, listScaffolds,

    // Validation
    ValidationHarness, ValidationResult,

    // Factory
    createLSGv2,
    VERSION, ARCHITECTURE,
} from './index.js';

// Test utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`${colors.green}✓${colors.reset} ${name}`);
        passed++;
    } catch (error) {
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${colors.dim}${error.message}${colors.reset}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`${colors.green}✓${colors.reset} ${name}`);
        passed++;
    } catch (error) {
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${colors.dim}${error.message}${colors.reset}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function section(name) {
    console.log(`\n${colors.bright}${colors.cyan}━━━ ${name} ━━━${colors.reset}\n`);
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
    console.log(`\n${colors.bright}🧪 LSG v2 Comprehensive Test Suite${colors.reset}`);
    console.log(`${colors.dim}Version: ${VERSION} | Architecture: ${ARCHITECTURE}${colors.reset}`);

    // --------------------------------------------------------------------------
    section('1. World Model - EvidenceGraph');

    test('EvidenceGraph creates and stores events', () => {
        const graph = new EvidenceGraph();
        const event = createEvidenceEvent({
            source: 'test',
            event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
            target: 'https://example.com',
            payload: { path: '/api/users', method: 'GET' },
        });
        graph.addEvent(event);
        assert(graph.events.size === 1, 'Should have 1 event');
    });

    test('EvidenceGraph indexes by source and type', () => {
        const graph = new EvidenceGraph();
        graph.addEvent(createEvidenceEvent({ source: 'nmap', event_type: 'port_scan', target: 'x', payload: {} }));
        graph.addEvent(createEvidenceEvent({ source: 'gau', event_type: 'endpoint_discovered', target: 'x', payload: {} }));
        graph.addEvent(createEvidenceEvent({ source: 'gau', event_type: 'endpoint_discovered', target: 'y', payload: {} }));

        assert(graph.getEventsBySource('gau').length === 2, 'Should find 2 gau events');
        assert(graph.getEventsByType('endpoint_discovered').length === 2, 'Should find 2 endpoint events');
    });

    test('EvidenceGraph handles blob storage', () => {
        const graph = new EvidenceGraph();
        const blobId = graph.storeBlob(Buffer.from('test data'));
        const retrieved = graph.getBlob(blobId);
        assert(retrieved && retrieved.data.toString() === 'test data', 'Should retrieve blob');
    });

    test('EvidenceGraph serialization works', () => {
        const graph = new EvidenceGraph();
        graph.addEvent(createEvidenceEvent({ source: 'test', event_type: 'test', target: 'x', payload: { foo: 1 } }));
        const exported = graph.export();
        assert(exported.events.length === 1, 'Export should have events');
        assert(exported.version, 'Export should have version');
    });

    test('EvidenceGraph stats work', () => {
        const graph = new EvidenceGraph();
        graph.addEvent(createEvidenceEvent({ source: 'a', event_type: 't1', target: 'x', payload: {} }));
        graph.addEvent(createEvidenceEvent({ source: 'b', event_type: 't2', target: 'y', payload: {} }));
        const stats = graph.stats();
        assert(stats.total_events === 2, 'Should have 2 events');
        assert(stats.sources === 2, 'Should have 2 sources');
    });

    // --------------------------------------------------------------------------
    section('2. World Model - TargetModel');

    test('TargetModel creates entities', () => {
        const model = new TargetModel();
        model.addEntity({
            id: 'endpoint:GET:/users',
            entity_type: ENTITY_TYPES.ENDPOINT,
            attributes: { path: '/users', method: 'GET' },
            claim_refs: [],
        });
        assert(model.entities.size === 1, 'Should have 1 entity');
    });

    test('TargetModel creates relationships', () => {
        const model = new TargetModel();
        model.addEntity({ id: 'a', entity_type: 'component', attributes: {}, claim_refs: [] });
        model.addEntity({ id: 'b', entity_type: 'endpoint', attributes: {}, claim_refs: [] });
        model.addEdge({ source: 'a', target: 'b', relationship: RELATIONSHIP_TYPES.CONTAINS });
        assert(model.edges.length === 1, 'Should have 1 edge');
    });

    test('TargetModel endpoint helpers work', () => {
        const model = new TargetModel();
        const ep = createEndpointEntity('/api/users', 'POST', [{ name: 'name', type: 'string', location: 'body' }]);
        model.addEntity(ep);
        const endpoints = model.getEndpoints();
        assert(endpoints.length === 1, 'Should find 1 endpoint');
    });

    // --------------------------------------------------------------------------
    section('3. World Model - ArtifactManifest');

    test('ArtifactManifest tracks artifacts', () => {
        const manifest = new ArtifactManifest();
        manifest.addEntry({
            path: '/output/api.js',
            generated_from: ['endpoint:1'],
            evidence_refs: ['ev1'],
        });
        assert(manifest.entries.size === 1, 'Should have 1 entry');
    });

    test('ArtifactManifest getEntry works', () => {
        const manifest = new ArtifactManifest();
        manifest.addEntry({ path: '/test.js', generated_from: [], evidence_refs: [] });
        const entry = manifest.getEntry('/test.js');
        assert(entry, 'Should get entry');
        assert(entry.path === '/test.js', 'Path should match');
    });

    test('createEpistemicEnvelope works', () => {
        const envelope = createEpistemicEnvelope(
            { b: 0.7, d: 0.1, u: 0.2, a: 0.5 },
            ['claim1'],
            ['ev1'],
            ['note1']
        );
        assert(envelope.overall_opinion.b === 0.7, 'Belief should match');
        assert(envelope.uncertainties.length === 1, 'Should have uncertainty note');
    });

    // --------------------------------------------------------------------------
    section('4. Epistemic Ledger');

    test('EpistemicLedger creates claims via upsertClaim', () => {
        const ledger = new EpistemicLedger();
        const claim = ledger.upsertClaim({
            claim_type: CLAIM_TYPES.ENDPOINT_EXISTS,
            subject: '/api/users',
            predicate: { method: 'GET' },
        });
        assert(claim.id, 'Claim should have ID');
        assert(ledger.claims.size === 1, 'Ledger should have 1 claim');
    });

    test('Claim accumulates evidence', () => {
        const ledger = new EpistemicLedger();
        const claim = ledger.upsertClaim({
            claim_type: CLAIM_TYPES.ENDPOINT_EXISTS,
            subject: '/api/users',
            predicate: {},
        });
        claim.addEvidence('crawl_observed', 2);
        claim.addEvidence('crawl_observed', 1);
        claim.addEvidence('js_ast_direct', 1);
        assert(claim.evidence_vector.crawl_observed === 3, 'Evidence should accumulate');
    });

    test('ebslOpinion calculates correctly', () => {
        const opinion = ebslOpinion(5, 1, 2, 0.5); // r=5, s=1, K=2, a=0.5
        assert(opinion.b > 0.5, 'Belief should be > 0.5 with more positive');
        const sum = opinion.b + opinion.d + opinion.u;
        assert(Math.abs(sum - 1) < 0.001, 'Opinion should sum to 1');
    });

    test('expectedProbability works', () => {
        const p = expectedProbability({ b: 0.6, d: 0.1, u: 0.3, a: 0.5 });
        assert(p === 0.6 + 0.5 * 0.3, 'P = b + a*u');
    });

    test('aggregateEvidence works', () => {
        const vector = { crawl_observed: 2, active_probe_fail: 1 };
        const { r, s } = aggregateEvidence(vector, { crawl_observed: 0.9 }, { active_probe_fail: 1.0 });
        assert(r === 2 * 0.9, 'r should be weighted positive');
        assert(s === 1 * 1.0, 's should be weighted negative');
    });

    test('Ledger stats work', () => {
        const ledger = new EpistemicLedger();
        ledger.upsertClaim({ claim_type: CLAIM_TYPES.ENDPOINT_EXISTS, subject: 'a', predicate: {} });
        ledger.upsertClaim({ claim_type: CLAIM_TYPES.ENDPOINT_EXISTS, subject: 'b', predicate: {} });
        const stats = ledger.stats();
        assert(stats.total_claims === 2, 'Should have 2 claims');
    });

    // --------------------------------------------------------------------------
    section('5. Orchestrator');

    test('Orchestrator creates with agents', () => {
        const lsg = createLSGv2();
        const agents = lsg.registry.list();
        assert(agents.length === 15, `Should have 15 agents, got ${agents.length}`);
    });

    test('Orchestrator has world model components', () => {
        const lsg = createLSGv2();
        assert(lsg.evidenceGraph, 'Should have evidenceGraph');
        assert(lsg.targetModel, 'Should have targetModel');
        assert(lsg.ledger, 'Should have ledger');
        assert(lsg.manifest, 'Should have manifest');
    });

    test('PipelineStage creates correctly', () => {
        const stage = new PipelineStage('recon', ['CrawlerAgent', 'NetReconAgent'], { parallel: true });
        assert(stage.name === 'recon', 'Name should match');
        assert(stage.agents.length === 2, 'Should have 2 agents');
    });

    test('AgentRegistry registers and retrieves', () => {
        const registry = new AgentRegistry();
        const agent = { name: 'TestAgent', run: () => { } };
        registry.register(agent);
        assert(registry.get('TestAgent') === agent, 'Should retrieve agent');
        assert(registry.list().includes('TestAgent'), 'Should list agent');
    });

    // --------------------------------------------------------------------------
    section('6. BaseAgent Contract');

    test('BaseAgent creates with name', () => {
        const agent = new BaseAgent('TestAgent');
        assert(agent.name === 'TestAgent', 'Name should match');
        assert(agent.default_budget, 'Should have default_budget');
    });

    test('AgentContext provides world model access', () => {
        const lsg = createLSGv2();
        const ctx = new AgentContext({
            evidenceGraph: lsg.evidenceGraph,
            targetModel: lsg.targetModel,
            ledger: lsg.ledger,
            manifest: lsg.manifest,
        });
        assert(ctx.evidenceGraph, 'Should have evidenceGraph');
        assert(typeof ctx.recordTokens === 'function', 'Should have recordTokens');
    });

    // --------------------------------------------------------------------------
    section('7. Tool Runner');

    await testAsync('isToolAvailable detects tools', async () => {
        const nodeAvailable = await isToolAvailable('node');
        assert(nodeAvailable === true, 'node should be available');
    });

    await testAsync('runTool executes commands', async () => {
        const result = await runTool('echo "hello"', { timeout: 5000 });
        assert(result.success === true, 'Should succeed');
        assert(result.stdout.includes('hello'), 'Should capture output');
    });

    await testAsync('runTool handles timeout', async () => {
        const result = await runTool('sleep 10', { timeout: 100 });
        assert(result.success === false, 'Should fail on timeout');
    });

    // --------------------------------------------------------------------------
    section('8. Scaffold Packs');

    test('Express scaffold generates package.json', () => {
        const template = EXPRESS_SCAFFOLD.templates.package;
        const content = template({ name: 'test-api', auth: { mechanism: 'jwt' } });
        assert(content.includes('"name": "test-api"'), 'Should have name');
        assert(content.includes('jsonwebtoken'), 'Should include JWT');
    });

    test('Express scaffold generates routes', () => {
        const template = EXPRESS_SCAFFOLD.templates.routes_api;
        const content = template({
            endpoints: [{ path: '/users', method: 'GET', params: [] }],
            auth: null,
        });
        assert(content.includes("router.get('/users'"), 'Should have route');
    });

    test('FastAPI scaffold generates requirements', () => {
        const template = FASTAPI_SCAFFOLD.templates.requirements;
        const content = template({ auth: { mechanism: 'jwt' } });
        assert(content.includes('fastapi'), 'Should include FastAPI');
        assert(content.includes('python-jose'), 'Should include JWT lib');
    });

    test('getScaffold works', () => {
        const express = getScaffold('express');
        const fastapi = getScaffold('fastapi');
        assert(express && express.name === 'express', 'Should find Express');
        assert(fastapi && fastapi.name === 'fastapi', 'Should find FastAPI');
        assert(getScaffold('unknown') === null, 'Should return null for unknown');
    });

    test('listScaffolds returns all', () => {
        const list = listScaffolds();
        assert(list.includes('express'), 'Should include express');
        assert(list.includes('fastapi'), 'Should include fastapi');
    });

    // --------------------------------------------------------------------------
    section('9. Validation Harness');

    test('ValidationHarness detects language', () => {
        const harness = new ValidationHarness();
        assert(harness.detectLanguage('/test.js') === 'javascript', 'Should detect JS');
        assert(harness.detectLanguage('/test.py') === 'python', 'Should detect Python');
        assert(harness.detectLanguage('/test.ts') === 'typescript', 'Should detect TS');
    });

    test('ValidationResult has required fields', () => {
        const result = new ValidationResult({ stage: 'parse', passed: true, errors: [] });
        assert(result.stage === 'parse', 'Stage should match');
        assert(result.passed === true, 'Passed should match');
        assert(result.timestamp, 'Should have timestamp');
    });

    // --------------------------------------------------------------------------
    section('10. LLM Client');

    test('LLMClient creates with defaults', () => {
        const client = new LLMClient();
        assert(client.options.provider, 'Should have provider');
        assert(client.routing, 'Should have routing');
    });

    test('LLM_CAPABILITIES has expected capabilities', () => {
        assert(LLM_CAPABILITIES.CLASSIFY_FAST, 'Should have CLASSIFY_FAST');
        assert(LLM_CAPABILITIES.INFER_ARCHITECTURE, 'Should have INFER_ARCHITECTURE');
        assert(LLM_CAPABILITIES.SYNTHESIZE_CODE_PATCH, 'Should have SYNTHESIZE_CODE_PATCH');
    });

    test('getLLMClient returns client', () => {
        const client = getLLMClient();
        assert(client, 'Should return client');
        assert(typeof client.generate === 'function', 'Should have generate method');
    });

    // --------------------------------------------------------------------------
    section('11. StreamingEmitter');

    test('StreamingEmitter emits deltas', () => {
        const emitter = new StreamingEmitter();
        let received = null;
        emitter.on('delta', (d) => { received = d; });
        emitter.emitDelta(DELTA_TYPES.EVIDENCE, { test: 1 });
        assert(received, 'Should receive delta');
        assert(received.type === DELTA_TYPES.EVIDENCE, 'Type should match');
    });

    test('StreamingEmitter has emit functionality', () => {
        const emitter = new StreamingEmitter();
        let count = 0;
        emitter.on('delta', () => { count++; });
        emitter.emitDelta(DELTA_TYPES.EVIDENCE, {});
        emitter.emitDelta(DELTA_TYPES.CLAIM, {});
        assert(count === 2, 'Should have received 2 deltas');
    });

    // --------------------------------------------------------------------------
    section('12. Integration - Full Pipeline');

    await testAsync('Full pipeline creates working orchestrator', async () => {
        const lsg = createLSGv2({ mode: 'replay' });

        // Manually add some evidence
        lsg.evidenceGraph.addEvent(createEvidenceEvent({
            source: 'test',
            event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
            target: 'https://test.com',
            payload: { path: '/api/v1/users', method: 'GET', params: [] },
        }));

        // Add to target model
        lsg.targetModel.addEntity(createEndpointEntity('/api/v1/users', 'GET', []));

        // Create claim using upsertClaim
        const claim = lsg.ledger.upsertClaim({
            claim_type: CLAIM_TYPES.ENDPOINT_EXISTS,
            subject: '/api/v1/users',
            predicate: { method: 'GET' },
        });
        claim.addEvidence('crawl_observed', 1);

        // Export state
        const state = lsg.exportState();
        assert(state.evidence_graph.events.length >= 1, 'Should export evidence');
        assert(state.ledger.claims.length >= 1, 'Should export claims');
    });

    // --------------------------------------------------------------------------
    // Summary
    console.log(`\n${colors.bright}━━━ Summary ━━━${colors.reset}\n`);
    console.log(`${colors.green}✓ Passed: ${passed}${colors.reset}`);
    if (failed > 0) {
        console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
    }
    console.log(`\nTotal: ${passed + failed} tests\n`);

    return failed === 0;
}

// Run tests
runTests()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
