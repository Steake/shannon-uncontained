/**
 * Comprehensive Tests for Dark Matter Analyzer
 * 
 * Run with: node --test src/local-source-generator/tests/dark-matter.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    extractHiddenEndpoints,
    detectObfuscation,
    identifyWebSockets,
    HIDDEN_DIRECTORIES,
    OBFUSCATION_PATTERNS
} from '../analyzers/dark-matter.js';

describe('extractHiddenEndpoints', () => {
    test('should extract endpoints from string literals', () => {
        const content = 'const url = "/api/v1/secret-endpoint"';

        const result = extractHiddenEndpoints(content);

        assert.ok(result.length > 0, 'Should extract API path from string');
        assert.ok(result.some(e => e.path.includes('/api/v1/')));
    });

    test('should extract internal API paths', () => {
        const content = `
            fetch('/internal/admin/users')
            fetch('/debug/logs')
        `;

        const result = extractHiddenEndpoints(content);

        assert.ok(result.length >= 1);
    });

    test('should include source context', () => {
        const content = '// TODO: /api/test endpoint';

        const result = extractHiddenEndpoints(content);

        assert.ok(result[0].source === 'comment');
        assert.ok(result[0].context);
    });

    test('should deduplicate paths', () => {
        const content = `
            '/api/users'
            '/api/users'
            '/api/users'
        `;

        const result = extractHiddenEndpoints(content);
        const paths = result.filter(e => e.path === '/api/users');

        assert.ok(paths.length <= 1);
    });

    test('should handle empty/null input', () => {
        assert.deepEqual(extractHiddenEndpoints(''), []);
        assert.deepEqual(extractHiddenEndpoints(null), []);
    });
});

describe('detectObfuscation', () => {
    test('should detect packed JavaScript', () => {
        const content = "eval(function(p,a,c,k,e,d){...})";

        const result = detectObfuscation(content);

        assert.ok(result.isObfuscated);
        assert.ok(result.patterns.some(p => p.type === 'packedJS'));
    });

    test('should detect hex strings', () => {
        const content = 'var x = "\\x48\\x65\\x6c\\x6c\\x6f"';

        const result = detectObfuscation(content);

        assert.ok(result.patterns.some(p => p.type === 'hexStrings'));
    });

    test('should detect obfuscator.io patterns', () => {
        const content = 'var _0x1234 = function(_0x5678) { return _0x9abc; }';

        const result = detectObfuscation(content);

        assert.ok(result.patterns.some(p => p.type === 'obfuscatorIO'));
    });

    test('should calculate confidence based on patterns', () => {
        const lightObfuscation = 'var _0x1234 = "test"';
        const heavyObfuscation = `
            var _0x1234 = "\\x48\\x65";
            eval(function(p,a,c,k,e,d){});
            base64_encoded_string_here
        `;

        const lightResult = detectObfuscation(lightObfuscation);
        const heavyResult = detectObfuscation(heavyObfuscation);

        assert.ok(heavyResult.confidence >= lightResult.confidence);
    });

    test('should provide recommendations', () => {
        const content = 'eval(function(p,a,c,k,e,d){...})';

        const result = detectObfuscation(content);

        assert.ok(result.recommendations.length > 0);
    });

    test('should return false for clean code', () => {
        const content = 'function hello() { return "world"; }';

        const result = detectObfuscation(content);

        assert.equal(result.isObfuscated, false);
        assert.equal(result.patterns.length, 0);
    });
});

describe('identifyWebSockets', () => {
    test('should identify WebSocket constructor', () => {
        const content = 'new WebSocket("wss://example.com/socket")';

        const result = identifyWebSockets(content);

        assert.ok(result.length > 0);
        assert.ok(result[0].url.includes('wss://'));
    });

    test('should identify ws:// protocol', () => {
        const content = 'const socket = new WebSocket("ws://localhost:8080")';

        const result = identifyWebSockets(content);

        assert.equal(result[0].protocol, 'ws');
    });

    test('should identify wss:// protocol', () => {
        const content = 'connect("wss://secure.example.com/ws")';

        const result = identifyWebSockets(content);

        assert.equal(result[0].protocol, 'wss');
    });

    test('should deduplicate URLs', () => {
        const content = `
            new WebSocket("wss://example.com/socket")
            new WebSocket("wss://example.com/socket")
        `;

        const result = identifyWebSockets(content);

        assert.equal(result.length, 1);
    });

    test('should handle empty input', () => {
        assert.deepEqual(identifyWebSockets(''), []);
        assert.deepEqual(identifyWebSockets(null), []);
    });
});

describe('Constants', () => {
    test('HIDDEN_DIRECTORIES should include common paths', () => {
        assert.ok(HIDDEN_DIRECTORIES.includes('/admin'));
        assert.ok(HIDDEN_DIRECTORIES.includes('/backup'));
        assert.ok(HIDDEN_DIRECTORIES.includes('/.git'));
        assert.ok(HIDDEN_DIRECTORIES.includes('/debug'));
    });

    test('OBFUSCATION_PATTERNS should have detection regexes', () => {
        assert.ok(OBFUSCATION_PATTERNS.packedJS);
        assert.ok(OBFUSCATION_PATTERNS.hexStrings);
        assert.ok(OBFUSCATION_PATTERNS.obfuscatorIO);
    });
});
