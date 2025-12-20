/**
 * Tests for Inference Utilities
 * 
 * Run with: npm run test:inference
 * Or: node --test src/local-source-generator/tests/inference.test.js
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
    inferParameterType,
    inferHttpMethod,
    inferModelSchema,
    generateSecurityAnnotations
} from '../utils/inference.js';

// --- inferParameterType tests ---

test('inferParameterType: should identify ID parameters', () => {
    const result = inferParameterType('user_id', '123');

    assert.equal(result.type, 'integer');
    assert.equal(result.isSecurityRelevant, true);
    assert.ok(result.candidateFor.includes('IDOR'));
});

test('inferParameterType: should identify email parameters', () => {
    const result = inferParameterType('email', 'test@example.com');

    assert.equal(result.type, 'string');
    assert.equal(result.format, 'email');
    assert.equal(result.isSecurityRelevant, true);
});

test('inferParameterType: should identify URL parameters as SSRF candidates', () => {
    const result = inferParameterType('redirect', 'https://example.com');

    assert.equal(result.type, 'string');
    assert.equal(result.format, 'uri');
    assert.ok(result.candidateFor.includes('SSRF'));
});

test('inferParameterType: should identify file parameters as LFI candidates', () => {
    const result = inferParameterType('filename', 'report.pdf');

    assert.equal(result.isSecurityRelevant, true);
    assert.ok(result.candidateFor.includes('LFI'));
});

test('inferParameterType: should identify command parameters', () => {
    const result = inferParameterType('cmd', 'ls');

    assert.ok(result.candidateFor.includes('Command Injection'));
});

test('inferParameterType: should identify search parameters as SQLi/XSS candidates', () => {
    const result = inferParameterType('query', 'test');

    assert.ok(result.candidateFor.includes('SQLi'));
    assert.ok(result.candidateFor.includes('XSS'));
});

test('inferParameterType: should infer integer from numeric value', () => {
    const result = inferParameterType('unknown', '42');

    assert.equal(result.type, 'integer');
});

test('inferParameterType: should infer boolean from true/false value', () => {
    const result = inferParameterType('unknown', 'true');

    assert.equal(result.type, 'boolean');
});

test('inferParameterType: should default to string for unknown', () => {
    const result = inferParameterType('xyz', 'abc');

    assert.equal(result.type, 'string');
    assert.equal(result.isSecurityRelevant, false);
});

// --- inferHttpMethod tests ---

test('inferHttpMethod: should infer POST for create endpoints', () => {
    assert.equal(inferHttpMethod('/api/users/create'), 'POST');
    assert.equal(inferHttpMethod('/api/orders/new'), 'POST');
    assert.equal(inferHttpMethod('/register'), 'POST');
});

test('inferHttpMethod: should infer DELETE for delete endpoints', () => {
    assert.equal(inferHttpMethod('/api/users/delete'), 'DELETE');
    assert.equal(inferHttpMethod('/api/items/remove'), 'DELETE');
});

test('inferHttpMethod: should infer PUT for update endpoints', () => {
    assert.equal(inferHttpMethod('/api/users/update'), 'PUT');
    assert.equal(inferHttpMethod('/api/profile/edit'), 'PUT');
});

test('inferHttpMethod: should infer POST for login endpoints', () => {
    assert.equal(inferHttpMethod('/login'), 'POST');
    assert.equal(inferHttpMethod('/auth/signin'), 'POST');
});

test('inferHttpMethod: should infer POST for form actions', () => {
    assert.equal(inferHttpMethod('/submit', { isFormAction: true }), 'POST');
});

test('inferHttpMethod: should default to GET', () => {
    assert.equal(inferHttpMethod('/api/users'), 'GET');
    assert.equal(inferHttpMethod('/profile'), 'GET');
});

// --- inferModelSchema tests ---

test('inferModelSchema: should create schema from form fields', () => {
    const fields = [
        { name: 'email', type: 'email', required: true },
        { name: 'password', type: 'password', required: true },
        { name: 'remember', type: 'checkbox', required: false }
    ];

    const schema = inferModelSchema(fields);

    assert.equal(schema.type, 'object');
    assert.ok(schema.properties.email);
    assert.ok(schema.properties.password);
    assert.deepEqual(schema.required, ['email', 'password']);
});

// --- generateSecurityAnnotations tests ---

test('generateSecurityAnnotations: should identify parameter risks', () => {
    const endpoint = {
        path: '/api/users',
        params: {
            id: '1',
            redirect: 'https://evil.com'
        }
    };

    const annotations = generateSecurityAnnotations(endpoint);

    assert.ok(annotations.parameterRisks.id);
    assert.ok(annotations.parameterRisks.redirect);
    assert.ok(annotations.vulnerabilityHints.includes('SSRF'));
});

test('generateSecurityAnnotations: should flag admin paths', () => {
    const endpoint = {
        path: '/admin/users',
        params: {}
    };

    const annotations = generateSecurityAnnotations(endpoint);

    assert.ok(annotations.vulnerabilityHints.includes('Authorization Bypass'));
});
