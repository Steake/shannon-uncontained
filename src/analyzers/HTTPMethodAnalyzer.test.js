// Tests for HTTPMethodAnalyzer

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeHTTPMethods, parseAllowHeader } from './HTTPMethodAnalyzer.js';

describe('HTTPMethodAnalyzer', () => {
    describe('parseAllowHeader', () => {
        it('should parse comma-separated methods', () => {
            const methods = parseAllowHeader('GET, POST, PUT, DELETE');
            assert.deepStrictEqual(methods, ['GET', 'POST', 'PUT', 'DELETE']);
        });

        it('should handle empty header', () => {
            const methods = parseAllowHeader('');
            assert.deepStrictEqual(methods, []);
        });

        it('should normalize to uppercase', () => {
            const methods = parseAllowHeader('get, post');
            assert.deepStrictEqual(methods, ['GET', 'POST']);
        });
    });

    describe('analyzeHTTPMethods (WSTG-CONF-06)', () => {
        it('should flag PUT method', () => {
            const responses = [{
                url: 'https://api.example.com/upload',
                allowedMethods: ['GET', 'POST', 'PUT']
            }];

            const findings = analyzeHTTPMethods(responses);
            const putFinding = findings.find(f => f.object === 'PUT');

            assert.ok(putFinding, 'Should find PUT method');
            assert.strictEqual(putFinding.wstgId, 'WSTG-CONF-06');
        });

        it('should flag DELETE method', () => {
            const responses = [{
                url: 'https://api.example.com/resource',
                allowedMethods: ['GET', 'DELETE']
            }];

            const findings = analyzeHTTPMethods(responses);
            const deleteFinding = findings.find(f => f.object === 'DELETE');

            assert.ok(deleteFinding, 'Should find DELETE method');
        });

        it('should flag TRACE method with high severity', () => {
            const responses = [{
                url: 'https://example.com',
                allowedMethods: ['GET', 'TRACE']
            }];

            const findings = analyzeHTTPMethods(responses);
            const traceFinding = findings.find(f => f.object === 'TRACE');

            assert.ok(traceFinding, 'Should find TRACE method');
            assert.strictEqual(traceFinding.severity, 'high');
        });

        it('should report XST vulnerability for TRACE', () => {
            const responses = [{
                url: 'https://example.com',
                allowedMethods: ['TRACE']
            }];

            const findings = analyzeHTTPMethods(responses);
            const xstFinding = findings.find(f => f.predicate === 'vulnerable_to_xst');

            assert.ok(xstFinding, 'Should report XST vulnerability');
        });

        it('should not flag safe methods', () => {
            const responses = [{
                url: 'https://api.example.com',
                allowedMethods: ['GET', 'POST', 'HEAD', 'OPTIONS']
            }];

            const findings = analyzeHTTPMethods(responses);

            assert.strictEqual(findings.length, 0, 'Should not flag safe methods');
        });

        it('should handle string allowedMethods', () => {
            const responses = [{
                url: 'https://example.com',
                allowedMethods: 'GET, PUT, DELETE'
            }];

            const findings = analyzeHTTPMethods(responses);

            assert.ok(findings.length >= 2, 'Should find PUT and DELETE');
        });
    });

    describe('EQBSL tensors', () => {
        it('should include valid EQBSL tensor on findings', () => {
            const responses = [{
                url: 'https://example.com',
                allowedMethods: ['PUT', 'DELETE', 'TRACE']
            }];

            const findings = analyzeHTTPMethods(responses);

            for (const finding of findings) {
                assert.ok(finding.eqbsl, 'Should have EQBSL tensor');
                const sum = finding.eqbsl.b + finding.eqbsl.d + finding.eqbsl.u;
                assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum should be ~1, got ${sum}`);
            }
        });
    });
});
