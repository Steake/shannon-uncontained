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
        it('should export to a JSON file', async () => {
            model.addEvidence({ foo: 'bar' }, 'Test');
            const filePath = await model.export('test-export.json');

            assert.ok(await fs.pathExists(filePath));
            const content = await fs.readJSON(filePath);
            assert.strictEqual(content.evidence.length, 1);
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
