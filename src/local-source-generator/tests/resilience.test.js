/**
 * Tests for Resilience Utilities
 * 
 * Run with: npm run test:resilience
 * Or: node --test src/local-source-generator/tests/resilience.test.js
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
    withRetry,
    withTimeout,
    withFallback,
    validateUrl,
    isRetryableError,
    sleep
} from '../utils/resilience.js';

// --- withRetry tests ---

test('withRetry: should return result on success', async () => {
    const result = await withRetry(async () => 'success');
    assert.equal(result, 'success');
});

test('withRetry: should retry on failure', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
    }, { maxRetries: 3, baseDelay: 10 });

    assert.equal(result, 'success');
    assert.equal(attempts, 3);
});

test('withRetry: should throw after max retries', async () => {
    let attempts = 0;

    await assert.rejects(
        async () => {
            await withRetry(async () => {
                attempts++;
                throw new Error('always fails');
            }, { maxRetries: 3, baseDelay: 10 });
        },
        { message: 'always fails' }
    );

    assert.equal(attempts, 3);
});

test('withRetry: should respect shouldRetry predicate', async () => {
    let attempts = 0;
    const nonRetryableError = new Error('not retryable');
    nonRetryableError.code = 'DONT_RETRY';

    await assert.rejects(
        async () => {
            await withRetry(async () => {
                attempts++;
                throw nonRetryableError;
            }, {
                maxRetries: 3,
                baseDelay: 10,
                shouldRetry: (err) => err.code !== 'DONT_RETRY'
            });
        },
        { message: 'not retryable' }
    );

    assert.equal(attempts, 1); // Should not retry
});

// --- withTimeout tests ---

test('withTimeout: should return result when completing in time', async () => {
    const result = await withTimeout(
        async () => {
            await sleep(10);
            return 'done';
        },
        1000,
        'FastOperation'
    );

    assert.equal(result, 'done');
});

test('withTimeout: should throw on timeout', async () => {
    await assert.rejects(
        async () => {
            await withTimeout(
                async () => {
                    await sleep(1000);
                    return 'never';
                },
                50,
                'SlowOperation'
            );
        },
        (err) => {
            assert.match(err.message, /SlowOperation timed out/);
            assert.equal(err.isTimeout, true);
            return true;
        }
    );
});

// --- withFallback tests ---

test('withFallback: should return result on success', async () => {
    const result = await withFallback(
        async () => 'success',
        'fallback'
    );

    assert.equal(result, 'success');
});

test('withFallback: should return fallback on error', async () => {
    const result = await withFallback(
        async () => { throw new Error('fail'); },
        'fallback',
        { logError: false }
    );

    assert.equal(result, 'fallback');
});

// --- validateUrl tests ---

test('validateUrl: should accept valid HTTP URL', () => {
    const url = validateUrl('http://example.com');
    assert.equal(url.hostname, 'example.com');
});

test('validateUrl: should accept valid HTTPS URL', () => {
    const url = validateUrl('https://example.com/path?query=1');
    assert.equal(url.hostname, 'example.com');
    assert.equal(url.pathname, '/path');
});

test('validateUrl: should reject missing protocol', () => {
    assert.throws(
        () => validateUrl('example.com'),
        /must start with http:\/\/ or https:\/\//
    );
});

test('validateUrl: should reject empty string', () => {
    assert.throws(
        () => validateUrl(''),
        /URL is required/
    );
});

test('validateUrl: should reject localhost without LSG_ALLOW_PRIVATE', () => {
    delete process.env.LSG_ALLOW_PRIVATE;

    assert.throws(
        () => validateUrl('http://localhost:3000'),
        /Private\/local targets require LSG_ALLOW_PRIVATE/
    );
});

test('validateUrl: should accept localhost with LSG_ALLOW_PRIVATE', () => {
    process.env.LSG_ALLOW_PRIVATE = '1';

    const url = validateUrl('http://localhost:3000');
    assert.equal(url.hostname, 'localhost');

    delete process.env.LSG_ALLOW_PRIVATE;
});

// --- isRetryableError tests ---

test('isRetryableError: should identify network errors', () => {
    const networkError = new Error('Connection failed');
    networkError.code = 'ECONNRESET';

    assert.equal(isRetryableError(networkError), true);
});

test('isRetryableError: should identify timeout errors', () => {
    const timeoutError = new Error('Timed out');
    timeoutError.isTimeout = true;

    assert.equal(isRetryableError(timeoutError), true);
});

test('isRetryableError: should not retry generic errors', () => {
    const genericError = new Error('Something went wrong');

    assert.equal(isRetryableError(genericError), false);
});
