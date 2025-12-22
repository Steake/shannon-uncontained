// Tests for BudgetManager

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BudgetManager, BudgetExceededError } from './BudgetManager.js';

describe('BudgetManager', () => {
    describe('constructor', () => {
        it('should initialize with default unlimited budgets', () => {
            const bm = new BudgetManager();
            assert.strictEqual(bm.limits.maxTimeMs, 0);
            assert.strictEqual(bm.limits.maxTokens, 0);
            assert.strictEqual(bm.limits.maxNetworkRequests, 0);
        });

        it('should accept custom limits', () => {
            const bm = new BudgetManager({
                maxTimeMs: 60000,
                maxTokens: 10000,
                maxNetworkRequests: 100
            });
            assert.strictEqual(bm.limits.maxTimeMs, 60000);
            assert.strictEqual(bm.limits.maxTokens, 10000);
            assert.strictEqual(bm.limits.maxNetworkRequests, 100);
        });
    });

    describe('track', () => {
        it('should increment usage counters', () => {
            const bm = new BudgetManager();
            bm.track('tokens', 500);
            bm.track('tokens', 300);
            assert.strictEqual(bm.usage.tokens, 800);
        });

        it('should default to increment of 1', () => {
            const bm = new BudgetManager();
            bm.track('networkRequests');
            bm.track('networkRequests');
            assert.strictEqual(bm.usage.networkRequests, 2);
        });

        it('should throw BudgetExceededError when limit exceeded', () => {
            const bm = new BudgetManager({ maxTokens: 100 });
            bm.track('tokens', 50);

            assert.throws(() => {
                bm.track('tokens', 100); // Total 150 > 100
            }, BudgetExceededError);
        });
    });

    describe('check', () => {
        it('should not throw when within limits', () => {
            const bm = new BudgetManager({ maxTokens: 1000 });
            bm.usage.tokens = 500;
            assert.doesNotThrow(() => bm.check());
        });

        it('should throw when tokens exceeded', () => {
            const bm = new BudgetManager({ maxTokens: 100 });
            bm.usage.tokens = 150;

            assert.throws(() => bm.check(), (err) => {
                assert.ok(err instanceof BudgetExceededError);
                assert.strictEqual(err.metric, 'tokens');
                return true;
            });
        });

        it('should throw when network requests exceeded', () => {
            const bm = new BudgetManager({ maxNetworkRequests: 10 });
            bm.usage.networkRequests = 15;

            assert.throws(() => bm.check(), BudgetExceededError);
        });

        it('should throw when time exceeded', async () => {
            const bm = new BudgetManager({ maxTimeMs: 50 });

            // Wait for time to elapse
            await new Promise(resolve => setTimeout(resolve, 100));

            assert.throws(() => bm.check(), (err) => {
                assert.ok(err instanceof BudgetExceededError);
                return true;
            });
        });
    });

    describe('getRemaining', () => {
        it('should return Infinity for unlimited budgets', () => {
            const bm = new BudgetManager();
            const remaining = bm.getRemaining();
            assert.strictEqual(remaining.maxTokens, Infinity);
            assert.strictEqual(remaining.maxNetworkRequests, Infinity);
        });

        it('should calculate remaining budget correctly', () => {
            const bm = new BudgetManager({ maxTokens: 1000, maxNetworkRequests: 50 });
            bm.usage.tokens = 300;
            bm.usage.networkRequests = 10;

            const remaining = bm.getRemaining();
            assert.strictEqual(remaining.maxTokens, 700);
            assert.strictEqual(remaining.maxNetworkRequests, 40);
        });

        it('should not return negative values', () => {
            const bm = new BudgetManager({ maxTokens: 100 });
            bm.usage.tokens = 150; // Over budget

            const remaining = bm.getRemaining();
            assert.strictEqual(remaining.maxTokens, 0);
        });
    });

    describe('BudgetExceededError', () => {
        it('should have correct properties', () => {
            const err = new BudgetExceededError('tokens', 100, 150);
            assert.strictEqual(err.name, 'BudgetExceededError');
            assert.strictEqual(err.metric, 'tokens');
            assert.ok(err.message.includes('tokens'));
            assert.ok(err.message.includes('150'));
            assert.ok(err.message.includes('100'));
        });
    });
});
