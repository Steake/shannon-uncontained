/**
 * Tests for Black-Box Configuration Module
 * 
 * Run with: npm run test:config
 * Or: node --test src/local-source-generator/tests/config.test.js
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
    isInScope,
    shouldPrioritize,
    filterEndpointsByScope,
    RateLimiter
} from '../utils/config.js';

// --- isInScope tests ---

test('isInScope: should allow URLs not matching any exclude pattern', () => {
    const config = {
        scope: { exclude: ['/admin/*'] },
        rules: { avoid: [] }
    };

    assert.equal(isInScope('https://example.com/api/users', config), true);
});

test('isInScope: should exclude URLs matching exclude pattern', () => {
    const config = {
        scope: { exclude: ['*/admin/*'] },
        rules: { avoid: [] }
    };

    assert.equal(isInScope('https://example.com/admin/settings', config), false);
});

test('isInScope: should exclude URLs matching rules.avoid path', () => {
    const config = {
        scope: { exclude: [] },
        rules: {
            avoid: [{ type: 'path', url_path: '/logout' }]
        }
    };

    assert.equal(isInScope('https://example.com/logout', config), false);
});

test('isInScope: should exclude URLs matching rules.avoid subdomain', () => {
    const config = {
        scope: { exclude: [] },
        rules: {
            avoid: [{ type: 'subdomain', url_path: 'www' }]
        }
    };

    assert.equal(isInScope('https://www.example.com/page', config), false);
    assert.equal(isInScope('https://api.example.com/page', config), true);
});

test('isInScope: should require match when include patterns specified', () => {
    const config = {
        scope: {
            include: ['*/api/*'],
            exclude: []
        },
        rules: { avoid: [] }
    };

    assert.equal(isInScope('https://example.com/api/users', config), true);
    assert.equal(isInScope('https://example.com/public/page', config), false);
});

// --- shouldPrioritize tests ---

test('shouldPrioritize: should return true for focus paths', () => {
    const config = {
        rules: {
            focus: [{ type: 'path', url_path: '/api/*' }]
        }
    };

    assert.equal(shouldPrioritize('https://example.com/api/admin', config), true);
    assert.equal(shouldPrioritize('https://example.com/public', config), false);
});

// --- filterEndpointsByScope tests ---

test('filterEndpointsByScope: should categorize endpoints correctly', () => {
    const endpoints = [
        { url: 'https://example.com/api/users' },
        { url: 'https://example.com/logout' },
        { url: 'https://example.com/api/admin' }
    ];

    const config = {
        scope: { exclude: [] },
        rules: {
            avoid: [{ type: 'path', url_path: '/logout' }],
            focus: [{ type: 'path', url_path: '*/admin*' }]
        }
    };

    const result = filterEndpointsByScope(endpoints, config);

    assert.equal(result.included.length, 2);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.prioritized.length, 1);
    assert.equal(result.excluded[0].url, 'https://example.com/logout');
    assert.equal(result.prioritized[0].url, 'https://example.com/api/admin');
});

// --- RateLimiter tests ---

test('RateLimiter: should not delay when disabled', async () => {
    const limiter = new RateLimiter({ rate_limiting: { enabled: false } });

    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 50, 'Should not delay when disabled');
});

test('RateLimiter: should track active requests', async () => {
    const limiter = new RateLimiter({
        rate_limiting: { enabled: true, concurrent_requests: 2 }
    });

    await limiter.acquire();
    assert.equal(limiter.activeRequests, 1);

    await limiter.acquire();
    assert.equal(limiter.activeRequests, 2);

    limiter.release();
    assert.equal(limiter.activeRequests, 1);
});
