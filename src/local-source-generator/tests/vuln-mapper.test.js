/**
 * Comprehensive Tests for Vulnerability Mapper
 * 
 * Run with: node --test src/local-source-generator/tests/vuln-mapper.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    mapEndpointsToVulnerabilities,
    generateHypothesisQueue,
    identifyInputVectors,
    VULNERABILITY_CLASSES
} from '../analyzers/vuln-mapper.js';

describe('mapEndpointsToVulnerabilities', () => {
    test('should map SQLi candidates correctly', () => {
        const endpoints = [
            { path: '/users', method: 'GET', params: [{ name: 'id', location: 'query' }] }
        ];

        const result = mapEndpointsToVulnerabilities(endpoints);

        assert.ok(result.high.length > 0 || result.critical.length > 0);
        const sqliFinding = [...result.critical, ...result.high].find(
            v => v.vulnerabilityClass === 'SQLi' || v.vulnerabilityClass === 'IDOR'
        );
        assert.ok(sqliFinding, 'Should detect id param as SQLi/IDOR candidate');
    });

    test('should map SSRF candidates correctly', () => {
        const endpoints = [
            { path: '/fetch', method: 'GET', params: [{ name: 'url', location: 'query' }] }
        ];

        const result = mapEndpointsToVulnerabilities(endpoints);

        const ssrfFinding = result.critical.find(v => v.vulnerabilityClass === 'SSRF');
        assert.ok(ssrfFinding, 'Should detect url param as SSRF candidate');
        assert.ok(ssrfFinding.exploitHints.length > 0, 'Should provide exploit hints');
    });

    test('should map Command Injection candidates', () => {
        const endpoints = [
            { path: '/ping', method: 'POST', params: [{ name: 'cmd', location: 'body' }] }
        ];

        const result = mapEndpointsToVulnerabilities(endpoints);

        const cmdFinding = result.critical.find(v => v.vulnerabilityClass === 'CommandInjection');
        assert.ok(cmdFinding, 'Should detect cmd param as Command Injection candidate');
    });

    test('should not map unrelated parameters', () => {
        const endpoints = [
            { path: '/products', method: 'GET', params: [{ name: 'color', location: 'query' }] }
        ];

        const result = mapEndpointsToVulnerabilities(endpoints);

        assert.equal(result.stats.unmapped, 1);
    });

    test('should calculate stats correctly', () => {
        const endpoints = [
            { path: '/users', params: [{ name: 'id' }] },
            { path: '/products', params: [{ name: 'color' }] },
            { path: '/fetch', params: [{ name: 'url' }] }
        ];

        const result = mapEndpointsToVulnerabilities(endpoints);

        assert.equal(result.stats.total, 3);
        assert.ok(result.stats.mapped >= 2);
    });
});

describe('generateHypothesisQueue', () => {
    test('should prioritize critical vulnerabilities first', () => {
        const vulnMapping = {
            critical: [{ endpoint: '/cmd', vulnerabilityClass: 'CommandInjection', matchedParams: [] }],
            high: [{ endpoint: '/users', vulnerabilityClass: 'SQLi', matchedParams: [] }],
            medium: [],
            low: [],
            stats: { total: 2, mapped: 2 }
        };

        const queue = generateHypothesisQueue(vulnMapping);

        assert.equal(queue[0].priority, 'critical');
        assert.equal(queue[1].priority, 'high');
    });

    test('should include test payloads', () => {
        const vulnMapping = {
            critical: [{ endpoint: '/cmd', vulnerabilityClass: 'CommandInjection', matchedParams: [] }],
            high: [],
            medium: [],
            low: [],
            stats: {}
        };

        const queue = generateHypothesisQueue(vulnMapping);

        assert.ok(queue[0].testPayloads.length > 0);
        assert.ok(queue[0].testPayloads.includes('; id'));
    });

    test('should assign unique IDs', () => {
        const vulnMapping = {
            critical: [
                { endpoint: '/a', vulnerabilityClass: 'SQLi', matchedParams: [] },
                { endpoint: '/b', vulnerabilityClass: 'SQLi', matchedParams: [] }
            ],
            high: [],
            medium: [],
            low: [],
            stats: {}
        };

        const queue = generateHypothesisQueue(vulnMapping);

        assert.notEqual(queue[0].id, queue[1].id);
    });
});

describe('identifyInputVectors', () => {
    test('should categorize query params', () => {
        const endpoints = [
            { path: '/search', params: [{ name: 'q', location: 'query' }] }
        ];

        const vectors = identifyInputVectors(endpoints);

        assert.ok(vectors.queryParams.length > 0);
        assert.equal(vectors.queryParams[0].name, 'q');
    });

    test('should categorize body params', () => {
        const endpoints = [
            { path: '/login', params: [{ name: 'password', location: 'body' }] }
        ];

        const vectors = identifyInputVectors(endpoints);

        assert.ok(vectors.bodyParams.length > 0);
        assert.equal(vectors.bodyParams[0].name, 'password');
    });

    test('should identify security-relevant params', () => {
        const endpoints = [
            { path: '/login', params: [{ name: 'password', location: 'body', value: 'secret' }] }
        ];

        const vectors = identifyInputVectors(endpoints);

        assert.ok(vectors.bodyParams[0].isSecurityRelevant);
    });
});

describe('VULNERABILITY_CLASSES', () => {
    test('should have all expected vulnerability classes', () => {
        const expectedClasses = ['SQLi', 'XSS', 'SSRF', 'LFI', 'IDOR', 'CommandInjection', 'OpenRedirect'];

        for (const cls of expectedClasses) {
            assert.ok(VULNERABILITY_CLASSES[cls], `Missing class: ${cls}`);
            assert.ok(VULNERABILITY_CLASSES[cls].sourcePatterns.length > 0);
        }
    });
});
