// Tests for SecurityHeaderAnalyzer

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeSecurityHeaders } from './SecurityHeaderAnalyzer.js';

describe('SecurityHeaderAnalyzer', () => {
    describe('HSTS checks (WSTG-CONF-07)', () => {
        it('should flag missing HSTS on HTTPS', () => {
            const responses = [{
                url: 'https://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);
            const hstsFinding = findings.find(f => f.predicate === 'missing_hsts');

            assert.ok(hstsFinding, 'Should find missing HSTS');
            assert.strictEqual(hstsFinding.wstgId, 'WSTG-CONF-07');
        });

        it('should flag weak HSTS max-age', () => {
            const responses = [{
                url: 'https://example.com',
                headers: { 'strict-transport-security': 'max-age=3600' }
            }];

            const findings = analyzeSecurityHeaders(responses);
            const weakHsts = findings.find(f => f.predicate === 'weak_hsts_max_age');

            assert.ok(weakHsts, 'Should find weak max-age');
            assert.strictEqual(weakHsts.object, 3600);
        });

        it('should not flag HSTS on HTTP URLs', () => {
            const responses = [{
                url: 'http://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);
            const hstsFinding = findings.find(f => f.predicate === 'missing_hsts');

            assert.ok(!hstsFinding, 'Should not flag HSTS on HTTP');
        });
    });

    describe('CORS checks (WSTG-CLNT-07)', () => {
        it('should flag wildcard CORS origin', () => {
            const responses = [{
                url: 'https://api.example.com',
                headers: { 'access-control-allow-origin': '*' }
            }];

            const findings = analyzeSecurityHeaders(responses);
            const corsFinding = findings.find(f => f.predicate === 'cors_wildcard_origin');

            assert.ok(corsFinding, 'Should find wildcard CORS');
            assert.strictEqual(corsFinding.severity, 'medium');
        });

        it('should flag credentials with origin reflection', () => {
            const responses = [{
                url: 'https://api.example.com',
                headers: {
                    'access-control-allow-origin': 'https://attacker.com',
                    'access-control-allow-credentials': 'true'
                }
            }];

            const findings = analyzeSecurityHeaders(responses);
            const credsFinding = findings.find(f => f.predicate === 'cors_credentials_with_origin');

            assert.ok(credsFinding, 'Should find credentials with origin');
            assert.strictEqual(credsFinding.severity, 'high');
        });
    });

    describe('Clickjacking checks (WSTG-CLNT-09)', () => {
        it('should flag missing frame protection', () => {
            const responses = [{
                url: 'https://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);
            const frameFinding = findings.find(f => f.predicate === 'missing_frame_protection');

            assert.ok(frameFinding, 'Should find missing frame protection');
            assert.strictEqual(frameFinding.wstgId, 'WSTG-CLNT-09');
        });

        it('should not flag when X-Frame-Options is set', () => {
            const responses = [{
                url: 'https://example.com',
                headers: { 'x-frame-options': 'DENY' }
            }];

            const findings = analyzeSecurityHeaders(responses);
            const frameFinding = findings.find(f => f.predicate === 'missing_frame_protection');

            assert.ok(!frameFinding, 'Should not flag when XFO is set');
        });

        it('should not flag when CSP frame-ancestors is set', () => {
            const responses = [{
                url: 'https://example.com',
                headers: { 'content-security-policy': "frame-ancestors 'self'" }
            }];

            const findings = analyzeSecurityHeaders(responses);
            const frameFinding = findings.find(f => f.predicate === 'missing_frame_protection');

            assert.ok(!frameFinding, 'Should not flag when CSP frame-ancestors is set');
        });
    });

    describe('Security header checks (WSTG-CONF-14)', () => {
        it('should flag missing X-Content-Type-Options', () => {
            const responses = [{
                url: 'https://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);
            const finding = findings.find(f => f.predicate === 'missing_content_type_options');

            assert.ok(finding, 'Should find missing X-Content-Type-Options');
        });

        it('should flag missing CSP', () => {
            const responses = [{
                url: 'https://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);
            const finding = findings.find(f => f.predicate === 'missing_csp');

            assert.ok(finding, 'Should find missing CSP');
        });
    });

    describe('EQBSL tensors', () => {
        it('should include valid EQBSL tensor on findings', () => {
            const responses = [{
                url: 'https://example.com',
                headers: {}
            }];

            const findings = analyzeSecurityHeaders(responses);

            for (const finding of findings) {
                assert.ok(finding.eqbsl, 'Should have EQBSL tensor');
                assert.ok(finding.eqbsl.b >= 0 && finding.eqbsl.b <= 1, 'b should be 0-1');
                assert.ok(finding.eqbsl.d >= 0 && finding.eqbsl.d <= 1, 'd should be 0-1');
                assert.ok(finding.eqbsl.u >= 0 && finding.eqbsl.u <= 1, 'u should be 0-1');

                const sum = finding.eqbsl.b + finding.eqbsl.d + finding.eqbsl.u;
                assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum should be ~1, got ${sum}`);
            }
        });
    });
});
