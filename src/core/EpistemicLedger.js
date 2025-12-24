
/**
 * EpistemicLedger - Manages uncertainty and confidence calibration.
 * 
 * Implements concepts from Evidence-Based Subjective Logic (EBSL).
 * Tracks:
 * - Belief (b)
 * - Disbelief (d)
 * - Uncertainty (u)
 * - Base rate (a)
 */
export class EpistemicLedger {
    constructor(defaultBaseRate = 0.5) {
        this.defaultBaseRate = defaultBaseRate;
        this.opinions = new Map(); // subjectId -> { b, d, u, a }
    }

    /**
     * Register an opinion on a subject (Claim or Entity)
     * @param {string} subjectId 
     * @param {number} belief - Confidence in truth (0-1)
     * @param {number} disbelief - Confidence in falsity (0-1)
     * @param {number} uncertainty - Lack of evidence (0-1)
     * @param {number} baseRate - Prior probability (default 0.5)
     */
    registerOpinion(subjectId, belief, disbelief, uncertainty, baseRate = this.defaultBaseRate) {
        // Validate: b + d + u must approx 1.0
        const sum = belief + disbelief + uncertainty;
        if (Math.abs(sum - 1.0) > 0.01) {
            // Auto-normalize if close, else warn/throw
            const scale = 1.0 / sum;
            belief *= scale;
            disbelief *= scale;
            uncertainty *= scale;
        }

        this.opinions.set(subjectId, { b: belief, d: disbelief, u: uncertainty, a: baseRate });
    }

    /**
     * Get the probability expectation (E = b + a*u)
     * @param {string} subjectId 
     * @returns {number} Probability 0-1
     */
    getExpectation(subjectId) {
        const op = this.opinions.get(subjectId);
        if (!op) return this.defaultBaseRate; // Default to base rate if unknown

        return op.b + (op.a * op.u);
    }

    /**
     * Get uncertainty for a subject
     * @param {string} subjectId 
     */
    getUncertainty(subjectId) {
        return this.opinions.get(subjectId)?.u || 1.0;
    }

    /**
     * Get subjects with highest uncertainty
     * @param {number} limit 
     */
    getTopUncertainty(limit = 10) {
        return Array.from(this.opinions.entries())
            .sort((a, b) => b[1].u - a[1].u)
            .slice(0, limit)
            .map(([id, op]) => ({ id, ...op }));
    }

    /**
     * Get "controversial" subjects (high uncertainty or split belief/disbelief)
     * For simplicity here, we define controversy as high (b*d) - meaning significant mass in both.
     */
    getTopControversial(limit = 10) {
        return Array.from(this.opinions.entries())
            .sort((a, b) => (b[1].b * b[1].d) - (a[1].b * a[1].d))
            .slice(0, limit)
            .map(([id, op]) => ({ id, ...op }));
    }
}
