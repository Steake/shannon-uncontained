// Tests for EpistemicLedger

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EpistemicLedger } from './EpistemicLedger.js';

describe('EpistemicLedger', () => {
    let ledger;

    beforeEach(() => {
        ledger = new EpistemicLedger(0.5);
    });

    describe('constructor', () => {
        it('should set default base rate', () => {
            assert.strictEqual(ledger.defaultBaseRate, 0.5);
        });

        it('should accept custom base rate', () => {
            const custom = new EpistemicLedger(0.3);
            assert.strictEqual(custom.defaultBaseRate, 0.3);
        });
    });

    describe('registerOpinion', () => {
        it('should store an opinion with b, d, u, a', () => {
            ledger.registerOpinion('claim-1', 0.7, 0.1, 0.2, 0.5);

            const op = ledger.opinions.get('claim-1');
            assert.ok(op);
            assert.strictEqual(op.b, 0.7);
            assert.strictEqual(op.d, 0.1);
            assert.strictEqual(op.u, 0.2);
            assert.strictEqual(op.a, 0.5);
        });

        it('should normalize if b+d+u != 1', () => {
            // Sum = 1.5, should normalize
            ledger.registerOpinion('claim-2', 0.6, 0.3, 0.6, 0.5);

            const op = ledger.opinions.get('claim-2');
            const sum = op.b + op.d + op.u;
            assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum should be ~1.0, got ${sum}`);
        });

        it('should use default base rate if not provided', () => {
            ledger.registerOpinion('claim-3', 0.5, 0.3, 0.2);

            const op = ledger.opinions.get('claim-3');
            assert.strictEqual(op.a, 0.5);
        });
    });

    describe('getExpectation', () => {
        it('should calculate E = b + a*u', () => {
            // b=0.6, d=0.2, u=0.2, a=0.5
            // E = 0.6 + 0.5*0.2 = 0.6 + 0.1 = 0.7
            ledger.registerOpinion('test', 0.6, 0.2, 0.2, 0.5);

            const expectation = ledger.getExpectation('test');
            assert.strictEqual(expectation, 0.7);
        });

        it('should return default base rate for unknown subjects', () => {
            const expectation = ledger.getExpectation('unknown');
            assert.strictEqual(expectation, 0.5);
        });

        it('should return 0 for complete disbelief', () => {
            // b=0, d=1, u=0, a=0.5
            // E = 0 + 0.5*0 = 0
            ledger.registerOpinion('disbelief', 0, 1, 0, 0.5);

            const expectation = ledger.getExpectation('disbelief');
            assert.strictEqual(expectation, 0);
        });

        it('should return 1 for complete belief', () => {
            // b=1, d=0, u=0, a=0.5
            // E = 1 + 0.5*0 = 1
            ledger.registerOpinion('belief', 1, 0, 0, 0.5);

            const expectation = ledger.getExpectation('belief');
            assert.strictEqual(expectation, 1);
        });
    });

    describe('getUncertainty', () => {
        it('should return uncertainty value', () => {
            ledger.registerOpinion('uncertain', 0.3, 0.3, 0.4, 0.5);

            const uncertainty = ledger.getUncertainty('uncertain');
            assert.strictEqual(uncertainty, 0.4);
        });

        it('should return 1.0 for unknown subjects (complete uncertainty)', () => {
            const uncertainty = ledger.getUncertainty('never-seen');
            assert.strictEqual(uncertainty, 1.0);
        });
    });

    describe('getTopUncertainty', () => {
        it('should return subjects sorted by uncertainty (highest first)', () => {
            ledger.registerOpinion('low-u', 0.8, 0.1, 0.1, 0.5);
            ledger.registerOpinion('high-u', 0.2, 0.1, 0.7, 0.5);
            ledger.registerOpinion('mid-u', 0.5, 0.1, 0.4, 0.5);

            const top = ledger.getTopUncertainty(3);

            assert.strictEqual(top.length, 3);
            assert.strictEqual(top[0].id, 'high-u');
            assert.strictEqual(top[1].id, 'mid-u');
            assert.strictEqual(top[2].id, 'low-u');
        });

        it('should respect limit parameter', () => {
            ledger.registerOpinion('a', 0.5, 0.2, 0.3, 0.5);
            ledger.registerOpinion('b', 0.5, 0.2, 0.3, 0.5);
            ledger.registerOpinion('c', 0.5, 0.2, 0.3, 0.5);

            const top = ledger.getTopUncertainty(2);
            assert.strictEqual(top.length, 2);
        });
    });

    describe('getTopControversial', () => {
        it('should return subjects with highest b*d product', () => {
            // Controversial: high belief AND high disbelief
            ledger.registerOpinion('not-controversial', 0.9, 0.05, 0.05, 0.5); // b*d = 0.045
            ledger.registerOpinion('controversial', 0.45, 0.45, 0.1, 0.5);     // b*d = 0.2025
            ledger.registerOpinion('uncertain', 0.1, 0.1, 0.8, 0.5);          // b*d = 0.01

            const top = ledger.getTopControversial(3);

            assert.strictEqual(top[0].id, 'controversial');
        });
    });
});
