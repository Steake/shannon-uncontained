/**
 * ReactiveVerifier - Glue layer for closed-loop verification
 * 
 * Connects Cortex predictions to existing probing infrastructure,
 * updating EQBSL beliefs based on probe outcomes.
 * 
 * Uses:
 * - endpoint-prober.js (existing)
 * - EpistemicLedger.addEvidence() (existing)
 */

import { probeEndpoint, classifyBehavior } from '../tools/probers/endpoint-prober.js';

export class ReactiveVerifier {
    constructor(options = {}) {
        this.ledger = options.ledger; // EpistemicLedger instance
        this.queue = [];
        this.processing = false;
        this.config = {
            maxConcurrency: options.concurrency || 3,
            minConfidenceToVerify: options.minConfidence || 0.6,
            maxQueueSize: options.maxQueueSize || 100,
            rateLimitMs: options.rateLimitMs || 500,
        };
        this.stats = {
            enqueued: 0,
            verified: 0,
            confirmed: 0,
            refuted: 0,
            inconclusive: 0,
        };
    }

    /**
     * Enqueue a claim for verification
     * @param {Claim} claim - Claim object from EpistemicLedger
     * @param {object} options - { priority: 'normal'|'high' }
     */
    enqueue(claim, options = {}) {
        if (!claim || !claim.id) return;

        // Skip if already verified or in queue
        if (claim.verified !== undefined && claim.verified !== null) return;
        if (this.queue.some(q => q.claim.id === claim.id)) return;

        // Skip if queue is full
        if (this.queue.length >= this.config.maxQueueSize) return;

        const entry = {
            claim,
            priority: options.priority || 'normal',
            addedAt: Date.now(),
        };

        if (options.priority === 'high') {
            this.queue.unshift(entry);
        } else {
            this.queue.push(entry);
        }

        this.stats.enqueued++;
        this._processQueue();
    }

    /**
     * Check if a claim should be verified
     * Verifies claims that:
     * 1. Have high uncertainty (need probing to reduce u)
     * 2. OR have moderate confidence but not yet verified
     * 3. AND are verifiable via HTTP probe
     */
    shouldVerify(claim) {
        if (!claim) return false;

        // Already verified
        if (claim.verified !== undefined && claim.verified !== null) return false;

        // Check if claim type is verifiable via HTTP probe
        const verifiableTypes = ['endpoint', 'waf', 'missing_security_header', 'framework'];
        const isVerifiable = verifiableTypes.some(t =>
            claim.claim_type?.includes(t) ||
            claim.subject?.startsWith('http')
        );

        if (!isVerifiable) return false;

        // Check opinion
        const opinion = claim.getOpinion ? claim.getOpinion() : claim.opinion;
        if (!opinion) return true; // No opinion yet, should verify

        // Verify if:
        // - High uncertainty (u > 0.5) - need to reduce uncertainty
        // - OR high belief but not yet probed
        return opinion.u > 0.5 || (opinion.b > 0.5 && !claim.evidence_vector?.active_probe_success);
    }

    /**
     * Process the verification queue
     */
    async _processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        try {
            while (this.queue.length > 0) {
                // Take batch
                const batch = this.queue.splice(0, this.config.maxConcurrency);

                // Verify in parallel
                await Promise.all(batch.map(entry => this._verify(entry.claim)));

                // Rate limit
                if (this.queue.length > 0) {
                    await new Promise(r => setTimeout(r, this.config.rateLimitMs));
                }
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Verify a single claim via HTTP probe
     */
    async _verify(claim) {
        try {
            // Extract URL from claim subject
            const url = this._extractUrl(claim);
            if (!url) {
                this.stats.inconclusive++;
                return;
            }

            // Probe using existing infrastructure
            const probeResult = await probeEndpoint(url);
            const behavior = classifyBehavior(probeResult);

            this.stats.verified++;

            // Update EQBSL based on outcome
            if (behavior.exists === true) {
                this.ledger.addEvidence(claim.id, 'active_probe_success', 1.0, 'ReactiveVerifier');
                this.stats.confirmed++;
            } else if (behavior.exists === false) {
                this.ledger.addEvidence(claim.id, 'active_probe_fail', 1.0, 'ReactiveVerifier');
                this.stats.refuted++;
            } else {
                // Inconclusive - don't update
                this.stats.inconclusive++;
            }

        } catch (error) {
            this.stats.inconclusive++;
        }
    }

    /**
     * Extract a probeable URL from claim subject
     */
    _extractUrl(claim) {
        // Subject patterns: 'endpoint:GET:/api/v1/users', 'https://example.com/api'
        const subject = claim.subject || '';

        if (subject.startsWith('http://') || subject.startsWith('https://')) {
            return subject;
        }

        if (subject.startsWith('endpoint:')) {
            // Format: endpoint:METHOD:PATH
            const parts = subject.split(':');
            if (parts.length >= 3) {
                const path = parts.slice(2).join(':');
                // Need base URL from claim predicate or context
                const baseUrl = claim.predicate?.baseUrl || claim.predicate?.target;
                if (baseUrl) {
                    return new URL(path, baseUrl).href;
                }
            }
        }

        return null;
    }

    /**
     * Get verification statistics
     */
    getStats() {
        return { ...this.stats, queueLength: this.queue.length };
    }
}
