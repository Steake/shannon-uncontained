/**
 * Arbiter - Multi-model prediction arbitration
 * 
 * Collects predictions from multiple weak models and produces
 * a consensus via weighted voting based on model reputations.
 */

import { modelRegistry } from './model-registry.js';

export class Arbiter {
    constructor(options = {}) {
        this.registry = options.registry || modelRegistry;
        this.entropyThreshold = options.entropyThreshold || 0.5;
    }

    /**
     * Arbitrate between multiple model predictions
     * @param {object[]} predictions - Array of { modelId, label, confidence }
     * @returns {object} Consensus result { label, confidence, model, contributing_models, entropy }
     */
    arbitrate(predictions) {
        if (!predictions || predictions.length === 0) {
            return {
                label: null,
                confidence: 0,
                model: 'arbiter',
                contributing_models: [],
                entropy: 1.0,
            };
        }

        // Single model - pass through
        if (predictions.length === 1) {
            const p = predictions[0];
            this.registry.recordPrediction(p.modelId);
            return {
                label: p.label,
                confidence: p.confidence,
                model: 'arbiter',
                contributing_models: [p.modelId],
                entropy: 0,
            };
        }

        // Calculate weighted votes
        const votes = {};
        let totalWeight = 0;

        for (const p of predictions) {
            const accuracy = this.registry.getAccuracy(p.modelId);
            const weight = accuracy * p.confidence;

            if (!votes[p.label]) {
                votes[p.label] = { weight: 0, supporters: [] };
            }
            votes[p.label].weight += weight;
            votes[p.label].supporters.push(p.modelId);
            totalWeight += weight;

            this.registry.recordPrediction(p.modelId);
        }

        // Find winner
        let winner = null;
        let maxWeight = 0;

        for (const [label, data] of Object.entries(votes)) {
            if (data.weight > maxWeight) {
                maxWeight = data.weight;
                winner = label;
            }
        }

        // Calculate entropy (measure of disagreement)
        const entropy = this._calculateEntropy(votes, totalWeight);

        // Confidence is lower when entropy is high
        const confidence = entropy < this.entropyThreshold
            ? Math.min(0.95, maxWeight / totalWeight)
            : Math.max(0.3, 0.5 - entropy);

        return {
            label: winner,
            confidence,
            model: 'arbiter',
            contributing_models: predictions.map(p => p.modelId),
            entropy,
            votes: Object.fromEntries(
                Object.entries(votes).map(([k, v]) => [k, v.weight / totalWeight])
            ),
        };
    }

    /**
     * Calculate entropy of vote distribution
     * @param {object} votes - Vote weights by label
     * @param {number} total - Total weight
     * @returns {number} Entropy 0-1
     */
    _calculateEntropy(votes, total) {
        if (total === 0) return 1.0;

        const labels = Object.keys(votes);
        if (labels.length <= 1) return 0;

        let entropy = 0;
        for (const label of labels) {
            const p = votes[label].weight / total;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }

        // Normalize to 0-1 (max entropy is log2(n) for n labels)
        const maxEntropy = Math.log2(labels.length);
        return entropy / maxEntropy;
    }

    /**
     * Check if arbitration should defer to verification
     * @param {object} result - Arbitration result
     * @returns {boolean} True if should verify immediately
     */
    shouldDeferToVerification(result) {
        return result.entropy > this.entropyThreshold;
    }
}

// Singleton instance
export const arbiter = new Arbiter();
