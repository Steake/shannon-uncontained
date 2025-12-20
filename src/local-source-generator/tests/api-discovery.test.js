/**
 * Comprehensive Tests for API Discovery
 * 
 * Run with: node --test src/local-source-generator/tests/api-discovery.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    extractAPIsFromJS,
    generateSchemathesisConfig,
    API_SCHEMA_PATHS
} from '../analyzers/api-discovery.js';

describe('extractAPIsFromJS', () => {
    test('should extract API endpoints from JS files', () => {
        const jsFiles = [
            {
                url: 'https://example.com/app.js',
                endpoints: ['/api/users', '/api/products', '/api/orders']
            }
        ];

        const result = extractAPIsFromJS(jsFiles);

        assert.equal(result.length, 3);
        assert.ok(result.every(r => r.path.startsWith('/api/')));
    });

    test('should deduplicate endpoints', () => {
        const jsFiles = [
            { url: 'a.js', endpoints: ['/api/users'] },
            { url: 'b.js', endpoints: ['/api/users'] }
        ];

        const result = extractAPIsFromJS(jsFiles);

        assert.equal(result.length, 1);
    });

    test('should infer HTTP method from path', () => {
        const jsFiles = [
            { url: 'a.js', endpoints: ['/api/users/create', '/api/users/delete'] }
        ];

        const result = extractAPIsFromJS(jsFiles);

        const createEndpoint = result.find(e => e.path.includes('create'));
        const deleteEndpoint = result.find(e => e.path.includes('delete'));

        assert.equal(createEndpoint.method, 'POST');
        assert.equal(deleteEndpoint.method, 'DELETE');
    });

    test('should classify endpoint types', () => {
        const jsFiles = [
            { url: 'a.js', endpoints: ['/api/login', '/api/admin/settings', '/api/upload'] }
        ];

        const result = extractAPIsFromJS(jsFiles);

        const login = result.find(e => e.path.includes('login'));
        const admin = result.find(e => e.path.includes('admin'));
        const upload = result.find(e => e.path.includes('upload'));

        assert.equal(login.type, 'authentication');
        assert.equal(admin.type, 'admin');
        assert.equal(upload.type, 'file-handling');
    });

    test('should handle empty input', () => {
        const result = extractAPIsFromJS([]);

        assert.equal(result.length, 0);
    });
});

describe('generateSchemathesisConfig', () => {
    test('should generate valid config structure', () => {
        const schema = {
            url: 'https://example.com/openapi.json',
            schema: {
                paths: {
                    '/users': { get: {}, post: {} },
                    '/products': { get: {} }
                }
            }
        };

        const config = generateSchemathesisConfig(schema, 'https://example.com');

        assert.equal(config.base_url, 'https://example.com');
        assert.ok(config.checks.includes('not_a_server_error'));
        assert.equal(config.operations.length, 2);
    });

    test('should include hypothesis settings', () => {
        const schema = { schema: { paths: {} } };

        const config = generateSchemathesisConfig(schema, 'https://example.com');

        assert.ok(config.hypothesis);
        assert.ok(config.hypothesis.max_examples > 0);
    });
});

describe('API_SCHEMA_PATHS', () => {
    test('should include common OpenAPI paths', () => {
        assert.ok(API_SCHEMA_PATHS.includes('/swagger.json'));
        assert.ok(API_SCHEMA_PATHS.includes('/openapi.json'));
        assert.ok(API_SCHEMA_PATHS.includes('/api-docs'));
    });

    test('should include GraphQL paths', () => {
        assert.ok(API_SCHEMA_PATHS.includes('/graphql'));
        assert.ok(API_SCHEMA_PATHS.includes('/graphiql'));
    });

    test('should include versioned API paths', () => {
        assert.ok(API_SCHEMA_PATHS.some(p => p.includes('/v1/')));
        assert.ok(API_SCHEMA_PATHS.some(p => p.includes('/v2/')));
    });
});
