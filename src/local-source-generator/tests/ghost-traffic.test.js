/**
 * Comprehensive Tests for Ghost Traffic Generator
 * 
 * Run with: node --test src/local-source-generator/tests/ghost-traffic.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    generateReplayTraffic,
    generateFuzzingRequests,
    generateRaceConditionTests,
    generateBehavioralPattern,
    TRAFFIC_PATTERNS,
    FUZZ_PAYLOADS
} from '../analyzers/ghost-traffic.js';

describe('generateReplayTraffic', () => {
    test('should generate replay traffic from endpoints', () => {
        const endpoints = [
            { path: '/users', method: 'GET', params: [{ name: 'id', type: 'number' }] },
            { path: '/login', method: 'POST', params: [{ name: 'user' }] }
        ];

        const result = generateReplayTraffic(endpoints, { groupByPath: false });

        assert.equal(result.length, 2);
        assert.ok(result[0].timing);
        assert.ok(result[0].timing.delay >= 0);
    });

    test('should group by base path when enabled', () => {
        const endpoints = [
            { path: '/api/users', method: 'GET' },
            { path: '/api/products', method: 'GET' },
            { path: '/auth/login', method: 'POST' }
        ];

        const result = generateReplayTraffic(endpoints, { groupByPath: true });

        assert.ok(result['/api']);
        assert.ok(result['/auth']);
        assert.equal(result['/api'].length, 2);
    });

    test('should sanitize parameter values', () => {
        const endpoints = [
            { path: '/users', params: [{ name: 'email', type: 'email' }] }
        ];

        const result = generateReplayTraffic(endpoints, { sanitize: true, groupByPath: false });

        assert.equal(result[0].params.email, 'test@example.com');
    });
});

describe('generateFuzzingRequests', () => {
    test('should generate fuzzing requests for each param', () => {
        const endpoints = [
            { path: '/search', method: 'GET', params: [{ name: 'q' }] }
        ];

        const result = generateFuzzingRequests(endpoints);

        assert.ok(result.length > 0);
        assert.ok(result.every(r => r.targetParam === 'q'));
    });

    test('should include multiple payload types', () => {
        const endpoints = [
            { path: '/search', params: [{ name: 'q' }] }
        ];

        const result = generateFuzzingRequests(endpoints);
        const payloadTypes = new Set(result.map(r => r.payloadType));

        assert.ok(payloadTypes.has('sqlInjection'));
        assert.ok(payloadTypes.has('xss'));
    });

    test('should respect maxPayloadsPerParam', () => {
        const endpoints = [
            { path: '/search', params: [{ name: 'q' }] }
        ];

        const result = generateFuzzingRequests(endpoints, {
            payloadTypes: ['sqlInjection'],
            maxPayloadsPerParam: 2
        });

        assert.equal(result.length, 2);
    });

    test('should skip endpoints without params', () => {
        const endpoints = [
            { path: '/home', params: [] }
        ];

        const result = generateFuzzingRequests(endpoints);

        assert.equal(result.length, 0);
    });
});

describe('generateRaceConditionTests', () => {
    test('should identify race condition candidates', () => {
        const endpoints = [
            { path: '/transfer', method: 'POST', params: [{ name: 'amount' }] },
            { path: '/products', method: 'GET', params: [] }
        ];

        const result = generateRaceConditionTests(endpoints);

        assert.equal(result.length, 1);
        assert.ok(result[0].endpoint.includes('transfer'));
    });

    test('should include concurrency settings', () => {
        const endpoints = [
            { path: '/withdraw', method: 'POST' }
        ];

        const result = generateRaceConditionTests(endpoints);

        assert.ok(result[0].concurrency >= 1);
        assert.equal(result[0].type, 'concurrent_requests');
    });

    test('should detect various race condition keywords', () => {
        const endpoints = [
            { path: '/redeem-coupon', method: 'POST' },
            { path: '/vote', method: 'POST' },
            { path: '/like', method: 'POST' }
        ];

        const result = generateRaceConditionTests(endpoints);

        assert.equal(result.length, 3);
    });
});

describe('generateBehavioralPattern', () => {
    test('should generate normal user pattern', () => {
        const result = generateBehavioralPattern('normal');

        assert.ok(result.timing.min >= 500);
        assert.ok(result.mouseMovement === true);
        assert.ok(result.headers['Accept-Language']);
    });

    test('should generate bot pattern', () => {
        const result = generateBehavioralPattern('bot');

        assert.equal(result.timing.min, 0);
        assert.equal(result.mouseMovement, false);
    });

    test('should generate mobile pattern', () => {
        const result = generateBehavioralPattern('mobile');

        assert.ok(result.userAgent.includes('Mobile'));
        assert.equal(result.clickPattern, 'touch');
    });

    test('should default to normal for unknown type', () => {
        const result = generateBehavioralPattern('unknown');

        assert.ok(result.timing.min >= 500);
    });
});

describe('Constants', () => {
    test('TRAFFIC_PATTERNS should have common patterns', () => {
        assert.ok(TRAFFIC_PATTERNS.login);
        assert.ok(TRAFFIC_PATTERNS.browse);
        assert.ok(TRAFFIC_PATTERNS.login.sequence.length > 0);
    });

    test('FUZZ_PAYLOADS should have all categories', () => {
        assert.ok(FUZZ_PAYLOADS.sqlInjection);
        assert.ok(FUZZ_PAYLOADS.xss);
        assert.ok(FUZZ_PAYLOADS.commandInjection);
        assert.ok(FUZZ_PAYLOADS.ssrf);
        assert.ok(FUZZ_PAYLOADS.pathTraversal);
    });
});
