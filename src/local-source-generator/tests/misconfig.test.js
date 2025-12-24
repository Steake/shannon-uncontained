/**
 * Comprehensive Tests for Misconfiguration Detector
 * 
 * Run with: node --test src/local-source-generator/tests/misconfig.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    detectGodModeParams,
    scanForSecrets,
    detectBuildPaths,
    extractSecurityTodos,
    GOD_MODE_PARAMS,
    SECRET_PATTERNS
} from '../analyzers/misconfig-detector.js';

describe('detectGodModeParams', () => {
    test('should detect debug parameters', () => {
        const endpoints = [
            { path: '/api', params: [{ name: 'debug' }] }
        ];

        const result = detectGodModeParams(endpoints);

        assert.ok(result.length > 0);
        assert.ok(result[0].param === 'debug');
    });

    test('should detect admin bypass parameters', () => {
        const endpoints = [
            { path: '/api', params: [{ name: 'isAdmin' }] }
        ];

        const result = detectGodModeParams(endpoints);

        assert.ok(result.some(r => r.param === 'isAdmin'));
    });

    test('should include test payloads', () => {
        const endpoints = [
            { path: '/api', params: [{ name: 'bypass' }] }
        ];

        const result = detectGodModeParams(endpoints);

        assert.ok(result[0].testPayloads.includes('true'));
        assert.ok(result[0].testPayloads.includes('1'));
    });

    test('should not flag normal parameters', () => {
        const endpoints = [
            { path: '/users', params: [{ name: 'username' }, { name: 'email' }] }
        ];

        const result = detectGodModeParams(endpoints);

        assert.equal(result.length, 0);
    });

    test('should detect compound param names', () => {
        const endpoints = [
            { path: '/api', params: [{ name: 'debug_mode' }, { name: 'testingEnabled' }] }
        ];

        const result = detectGodModeParams(endpoints);

        assert.ok(result.length >= 2);
    });
});

describe('scanForSecrets', () => {
    test('should detect AWS access keys', () => {
        const content = 'const key = "AKIAIOSFODNN7EXAMPLE"';

        const result = scanForSecrets(content);

        assert.ok(result.some(s => s.type === 'awsKey'));
    });

    test('should detect GitHub tokens', () => {
        const content = 'const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"';

        const result = scanForSecrets(content);

        assert.ok(result.some(s => s.type === 'githubToken'));
    });

    test('should detect hardcoded passwords', () => {
        const content = 'const config = { "password": "supersecret123" }';

        const result = scanForSecrets(content);

        assert.ok(result.some(s => s.type === 'password'), 'Should detect password pattern');
    });

    test('should detect private keys', () => {
        const content = '-----BEGIN RSA PRIVATE KEY-----';

        const result = scanForSecrets(content);

        assert.ok(result.some(s => s.type === 'privateKey'));
    });

    test('should detect MongoDB connection strings', () => {
        const content = 'const uri = "mongodb+srv://user:password@cluster.mongodb.net"';

        const result = scanForSecrets(content);

        assert.ok(result.some(s => s.type === 'connectionString'));
    });

    test('should mask secret values', () => {
        const content = 'const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"';

        const result = scanForSecrets(content);

        assert.ok(result[0].value.includes('****'));
        assert.ok(!result[0].value.includes('xxxxxxxxxxxx'));
    });

    test('should handle empty input', () => {
        assert.deepEqual(scanForSecrets(''), []);
        assert.deepEqual(scanForSecrets(null), []);
    });
});

describe('detectBuildPaths', () => {
    test('should detect macOS user paths', () => {
        const content = 'sourceMap: "/Users/john/projects/app/src/main.js"';

        const result = detectBuildPaths(content);

        assert.ok(result.length > 0);
        assert.equal(result[0].platform, 'macos');
    });

    test('should detect Linux home paths', () => {
        const content = 'path: "/home/developer/app/build/bundle.js"';

        const result = detectBuildPaths(content);

        assert.ok(result.some(p => p.platform === 'linux'));
    });

    test('should detect Windows paths', () => {
        const content = 'path: "C:\\Users\\Developer\\Projects\\app\\dist"';

        const result = detectBuildPaths(content);

        assert.ok(result.some(p => p.platform === 'windows'));
    });

    test('should deduplicate paths', () => {
        const content = `
            "/Users/dev/app/src/a.js"
            "/Users/dev/app/src/b.js"
        `;

        const result = detectBuildPaths(content);

        // Should deduplicate same base paths
        const uniquePaths = new Set(result.map(r => r.path));
        assert.equal(result.length, uniquePaths.size);
    });
});

describe('extractSecurityTodos', () => {
    test('should extract security-related TODOs', () => {
        const content = '// TODO: Fix authentication bypass in login';

        const result = extractSecurityTodos(content);

        assert.ok(result.length > 0);
        assert.equal(result[0].type, 'TODO');
    });

    test('should extract FIXME comments', () => {
        const content = '// FIXME: password is hardcoded';

        const result = extractSecurityTodos(content);

        assert.ok(result.some(t => t.type === 'FIXME'));
    });

    test('should extract HACK comments', () => {
        const content = '// HACK: bypassing auth check for now';

        const result = extractSecurityTodos(content);

        assert.ok(result.some(t => t.type === 'HACK'));
    });

    test('should mark security TODOs as high risk', () => {
        const content = '// FIXME: SECURITY: SQL injection vulnerability';

        const result = extractSecurityTodos(content);

        assert.ok(result.some(t => t.risk === 'high'));
    });

    test('should ignore non-security TODOs', () => {
        const content = '// TODO: refactor this function';

        const result = extractSecurityTodos(content);

        assert.equal(result.length, 0);
    });
});

describe('Constants', () => {
    test('GOD_MODE_PARAMS should include common debug params', () => {
        assert.ok(GOD_MODE_PARAMS.includes('debug'));
        assert.ok(GOD_MODE_PARAMS.includes('admin'));
        assert.ok(GOD_MODE_PARAMS.includes('bypass'));
    });

    test('SECRET_PATTERNS should have detection regexes', () => {
        assert.ok(SECRET_PATTERNS.awsKey);
        assert.ok(SECRET_PATTERNS.githubToken);
        assert.ok(SECRET_PATTERNS.password);
        assert.ok(SECRET_PATTERNS.privateKey);
    });
});
