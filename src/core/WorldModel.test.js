// Tests for WorldModel

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fs, path } from 'zx';
import { WorldModel } from './WorldModel.js';

describe('WorldModel', () => {
    let tmpDir;
    let model;

    beforeEach(async () => {
        tmpDir = path.join(process.cwd(), '.test-workspace-' + Date.now());
        await fs.ensureDir(tmpDir);
        model = new WorldModel(tmpDir);
        await model.init();
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    describe('addEvidence', () => {
        it('should add evidence and return an ID', () => {
            const id = model.addEvidence({ type: 'nmap', result: 'port 80 open' }, 'NetRecon');
            assert.ok(id, 'ID should be returned');
            assert.strictEqual(typeof id, 'string');
            assert.strictEqual(id.length, 16, 'ID should be 16 chars (truncated sha256)');
        });

        it('should store evidence retrievable via toJSON', () => {
            const freshModel = new WorldModel(tmpDir);
            freshModel.addEvidence({ scan: 'subdomain' }, 'SubdomainHunter');
            const json = freshModel.toJSON();
            assert.strictEqual(json.evidence.length, 1);
            assert.strictEqual(json.evidence[0].sourceAgent, 'SubdomainHunter');
        });

        it('should generate deterministic IDs for same content', () => {
            const id1 = model.addEvidence({ foo: 'bar' }, 'Agent1');
            const model2 = new WorldModel(tmpDir);
            const id2 = model2.addEvidence({ foo: 'bar' }, 'Agent1');
            assert.strictEqual(id1, id2, 'Same content should produce same ID');
        });

        it('should derive EQBSL tensor based on tool type', () => {
            const id = model.addEvidence({ tool: 'nmap', result: 'open' }, 'NetRecon');
            const json = model.toJSON();
            const evidence = json.evidence.find(e => e.id === id);

            assert.ok(evidence.eqbsl, 'Evidence should have EQBSL tensor');
            assert.ok(evidence.eqbsl.b >= 0 && evidence.eqbsl.b <= 1, 'Belief in range');
            assert.ok(evidence.eqbsl.d >= 0 && evidence.eqbsl.d <= 1, 'Disbelief in range');
            assert.ok(evidence.eqbsl.u >= 0 && evidence.eqbsl.u <= 1, 'Uncertainty in range');

            // b + d + u should equal 1
            const sum = evidence.eqbsl.b + evidence.eqbsl.d + evidence.eqbsl.u;
            assert.ok(Math.abs(sum - 1.0) < 0.01, `EQBSL sum should be 1, got ${sum}`);
        });

        it('should have higher belief for nmap than unknown tools', () => {
            model.addEvidence({ tool: 'nmap' }, 'A');
            model.addEvidence({ tool: 'unknown_fuzzer' }, 'B');
            const json = model.toJSON();

            const nmapEv = json.evidence.find(e => e.content.tool === 'nmap');
            const unknownEv = json.evidence.find(e => e.content.tool === 'unknown_fuzzer');

            assert.ok(nmapEv.eqbsl.b > unknownEv.eqbsl.b, 'nmap should have higher belief');
        });
    });

    describe('addClaim', () => {
        it('should add a claim with confidence', () => {
            const evId = model.addEvidence({ data: 'test' }, 'Recon');
            model.addClaim('/api/login', 'isVulnerable', 'SQLi', 0.85, [evId]);

            const json = model.toJSON();
            assert.strictEqual(json.claims.length, 1);
            assert.strictEqual(json.claims[0].subject, '/api/login');
            assert.strictEqual(json.claims[0].confidence, 0.85);
        });

        it('should create relations between evidence and claims', () => {
            const freshModel = new WorldModel(tmpDir);
            const evId = freshModel.addEvidence({ data: 'test' }, 'Recon');
            freshModel.addClaim('endpoint', 'exists', true, 1.0, [evId]);

            const json = freshModel.toJSON();
            assert.strictEqual(json.relations.length, 1);
            assert.strictEqual(json.relations[0].type, 'supports');
        });

        it('should derive EQBSL tensor from confidence and evidence count', () => {
            const ev1 = model.addEvidence({ a: 1 }, 'A');
            const ev2 = model.addEvidence({ b: 2 }, 'B');
            const ev3 = model.addEvidence({ c: 3 }, 'C');

            const claimId = model.addClaim('target', 'exists', true, 0.9, [ev1, ev2, ev3]);
            const json = model.toJSON();
            const claim = json.claims.find(c => c.id === claimId);

            assert.ok(claim.eqbsl, 'Claim should have EQBSL tensor');
            assert.ok(claim.eqbsl.b > 0.5, 'High confidence should yield high belief');
            assert.ok(claim.eqbsl.u < 0.5, 'Multiple evidence should lower uncertainty');

            const sum = claim.eqbsl.b + claim.eqbsl.d + claim.eqbsl.u;
            assert.ok(Math.abs(sum - 1.0) < 0.01, `EQBSL sum should be 1, got ${sum}`);
        });

        it('should have lower uncertainty with more evidence', () => {
            const ev1 = model.addEvidence({ x: 1 }, 'A');
            const ev2 = model.addEvidence({ y: 2 }, 'B');
            const ev3 = model.addEvidence({ z: 3 }, 'C');

            model.addClaim('few', 'test', true, 0.8, [ev1]);
            model.addClaim('many', 'test', true, 0.8, [ev1, ev2, ev3]);

            const json = model.toJSON();
            const fewEv = json.claims.find(c => c.subject === 'few');
            const manyEv = json.claims.find(c => c.subject === 'many');

            assert.ok(manyEv.eqbsl.u < fewEv.eqbsl.u, 'More evidence should lower uncertainty');
        });
    });

    describe('EQBSL integration', () => {
        it('should register opinions in EpistemicLedger', () => {
            const evId = model.addEvidence({ tool: 'nmap' }, 'A');
            const expectation = model.getExpectation(evId);

            assert.ok(expectation > 0, 'Expectation should be positive');
            assert.ok(expectation <= 1, 'Expectation should be <=1');
        });

        it('should compute expectation E = b + a*u', () => {
            // Add claim with known EQBSL
            const claimId = model.addClaim('test', 'pred', 'obj', 0.5, [], {
                b: 0.6, d: 0.1, u: 0.3, a: 0.5
            });

            const E = model.getExpectation(claimId);
            const expected = 0.6 + 0.5 * 0.3; // 0.75

            assert.ok(Math.abs(E - expected) < 0.01, `Expected ${expected}, got ${E}`);
        });

        it('should track uncertainty via getUncertainty()', () => {
            const evId = model.addEvidence({ tool: 'nmap' }, 'A');
            const u = model.getUncertainty(evId);

            assert.ok(u >= 0 && u <= 1, 'Uncertainty should be in [0,1]');
        });
    });

    describe('addArtifact', () => {
        it('should register an artifact', () => {
            model.addArtifact('reports/final.md', 'report', { format: 'markdown' });
            const json = model.toJSON();

            assert.strictEqual(json.artifacts.length, 1);
            assert.strictEqual(json.artifacts[0].artifactType, 'report');
            assert.deepStrictEqual(json.artifacts[0].metadata, { format: 'markdown' });
        });
    });

    describe('export', () => {
        it('should export to a JSON file with meta', async () => {
            model.addEvidence({ foo: 'bar' }, 'Test');
            const filePath = await model.export('test-export.json');

            assert.ok(await fs.pathExists(filePath));
            const content = await fs.readJSON(filePath);
            assert.strictEqual(content.evidence.length, 1);
            assert.ok(content.meta, 'Should include meta section');
            assert.strictEqual(content.meta.version, '1.1.0');
        });
    });

    describe('toJSON canonical sorting', () => {
        it('should sort evidence by ID for deterministic output', () => {
            // Add in non-alphabetical order
            model.addEvidence({ z: 1 }, 'A');
            model.addEvidence({ a: 1 }, 'B');
            model.addEvidence({ m: 1 }, 'C');

            const json = model.toJSON();
            const ids = json.evidence.map(e => e.id);
            const sortedIds = [...ids].sort();

            assert.deepStrictEqual(ids, sortedIds, 'Evidence should be sorted by ID');
        });
    });
});
