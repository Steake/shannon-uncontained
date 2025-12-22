// Tests for ErrorPatternAnalyzer

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeErrorPatterns } from './ErrorPatternAnalyzer.js';

describe('ErrorPatternAnalyzer', () => {
    describe('Stack trace detection (WSTG-ERRH-02)', () => {
        it('should detect Java stack traces', () => {
            const responses = [{
                url: 'https://api.example.com/error',
                body: 'at com.example.Service.doSomething(Service.java:42)',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const stackFinding = findings.find(f => f.predicate === 'exposes_stack_trace');

            assert.ok(stackFinding, 'Should find Java stack trace');
            assert.strictEqual(stackFinding.wstgId, 'WSTG-ERRH-02');
            assert.strictEqual(stackFinding.object, 'java');
        });

        it('should detect Python tracebacks', () => {
            const responses = [{
                url: 'https://api.example.com/error',
                body: 'Traceback (most recent call last):\n  File "/app/main.py", line 42, in handler',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const stackFinding = findings.find(f => f.predicate === 'exposes_stack_trace');

            assert.ok(stackFinding, 'Should find Python traceback');
        });

        it('should detect Node.js stack traces', () => {
            const responses = [{
                url: 'https://api.example.com/error',
                body: 'at processRequest (/app/server.js:123:45)',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const stackFinding = findings.find(f => f.predicate === 'exposes_stack_trace');

            assert.ok(stackFinding, 'Should find Node.js stack trace');
        });

        it('should detect PHP errors', () => {
            const responses = [{
                url: 'https://example.com/page.php',
                body: 'Fatal error: Uncaught Exception in /var/www/html/app.php on line 42',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const stackFinding = findings.find(f => f.predicate === 'exposes_stack_trace');

            assert.ok(stackFinding, 'Should find PHP error');
        });
    });

    describe('SQL error detection (WSTG-ERRH-01)', () => {
        it('should detect MySQL errors', () => {
            const responses = [{
                url: 'https://example.com/search',
                body: "You have an error in your SQL syntax near 'SELECT'",
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const sqlFinding = findings.find(f => f.predicate === 'exposes_sql_error');

            assert.ok(sqlFinding, 'Should find MySQL error');
            assert.strictEqual(sqlFinding.object, 'mysql');
        });

        it('should detect PostgreSQL errors', () => {
            const responses = [{
                url: 'https://example.com/query',
                body: 'ERROR: syntax error at or near "FROM"',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const sqlFinding = findings.find(f => f.predicate === 'exposes_sql_error');

            assert.ok(sqlFinding, 'Should find PostgreSQL error');
        });

        it('should detect Oracle errors', () => {
            const responses = [{
                url: 'https://example.com/data',
                body: 'ORA-00942: table or view does not exist',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const sqlFinding = findings.find(f => f.predicate === 'exposes_sql_error');

            assert.ok(sqlFinding, 'Should find Oracle error');
        });
    });

    describe('Debug info detection (WSTG-ERRH-01)', () => {
        it('should detect exposed config', () => {
            const responses = [{
                url: 'https://example.com/config',
                body: 'database.password = secret123',
                statusCode: 200
            }];

            const findings = analyzeErrorPatterns(responses);
            const configFinding = findings.find(f => f.object === 'config_exposed');

            assert.ok(configFinding, 'Should find exposed config');
            assert.strictEqual(configFinding.severity, 'critical');
        });

        it('should detect path disclosure', () => {
            const responses = [{
                url: 'https://example.com/error',
                body: 'Error loading file from /home/ubuntu/app/data.json',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);
            const pathFinding = findings.find(f => f.object === 'path_disclosure');

            assert.ok(pathFinding, 'Should find path disclosure');
        });

        it('should detect debug mode indicators', () => {
            const responses = [{
                url: 'https://example.com',
                body: '{"DEBUG": true, "version": "1.0"}',
                statusCode: 200
            }];

            const findings = analyzeErrorPatterns(responses);
            const debugFinding = findings.find(f => f.object === 'debug_mode');

            assert.ok(debugFinding, 'Should find debug mode');
        });
    });

    describe('No false positives', () => {
        it('should not flag clean responses', () => {
            const responses = [{
                url: 'https://example.com',
                body: '<html><body>Hello World</body></html>',
                statusCode: 200
            }];

            const findings = analyzeErrorPatterns(responses);

            assert.strictEqual(findings.length, 0, 'Should not flag clean response');
        });
    });

    describe('EQBSL tensors', () => {
        it('should include valid EQBSL tensor on findings', () => {
            const responses = [{
                url: 'https://example.com/error',
                body: 'at com.example.Error.throw(Error.java:1)',
                statusCode: 500
            }];

            const findings = analyzeErrorPatterns(responses);

            for (const finding of findings) {
                assert.ok(finding.eqbsl, 'Should have EQBSL tensor');
                const sum = finding.eqbsl.b + finding.eqbsl.d + finding.eqbsl.u;
                assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum should be ~1, got ${sum}`);
            }
        });
    });
});
