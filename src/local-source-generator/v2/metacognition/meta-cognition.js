/**
 * MetaCognition - System self-awareness and pathology detection
 * 
 * Monitors:
 * - Overall claim uncertainty
 * - Novelty in input features
 * - Contradictions in belief state
 * 
 * Emits hints to Scheduler for adaptive behavior.
 */

export const HINT_TYPES = {
    THROTTLE: 'throttle',
    PROBE_PRIORITY: 'probe_priority',
    ESCALATE: 'escalate',
    RECALIBRATE: 'recalibrate',
};

export const SEVERITY = {
    INFO: 1,
    WARNING: 2,
    CRITICAL: 3,
};

export class MetaCognition {
    constructor(options = {}) {
        this.worldModel = options.worldModel;
        this.ledger = options.ledger;
        this.config = {
            uncertaintyThreshold: options.uncertaintyThreshold || 0.6,
            controversyThreshold: options.controversyThreshold || 0,
            noveltyThreshold: options.noveltyThreshold || 0.4,
            driftThreshold: options.driftThreshold || 0.5,
            windowSize: options.windowSize || 100,
        };
        this.activeHints = [];
        this.stats = {
            checksPerformed: 0,
            hintsEmitted: 0,
            contradictionsDetected: 0,
            noveltyFlagged: 0,
        };
    }

    /**
     * Run all monitors and collect hints
     * @returns {object[]} Array of hints
     */
    check() {
        this.activeHints = [];
        this.stats.checksPerformed++;

        this._checkUncertainty();
        this._checkContradictions();

        return this.activeHints;
    }

    /**
     * Check average uncertainty across recent claims
     */
    _checkUncertainty() {
        if (!this.worldModel) return;

        const highUncertainty = this.worldModel.getHighUncertaintyClaims(this.config.windowSize);

        if (highUncertainty.length > this.config.windowSize * 0.5) {
            // More than 50% of recent claims have high uncertainty
            this._emitHint({
                type: HINT_TYPES.THROTTLE,
                severity: SEVERITY.WARNING,
                reason: `High uncertainty: ${highUncertainty.length}/${this.config.windowSize} claims`,
                affected_subjects: highUncertainty.slice(0, 10).map(c => c.subject),
            });
        }

        // Check if there are specific high-priority uncertain claims
        const veryUncertain = highUncertainty.filter(c => (c.u || 0) > 0.7);
        if (veryUncertain.length > 0) {
            this._emitHint({
                type: HINT_TYPES.PROBE_PRIORITY,
                severity: SEVERITY.INFO,
                reason: `${veryUncertain.length} claims need verification`,
                affected_subjects: veryUncertain.map(c => c.id),
            });
        }
    }

    /**
     * Check for contradictions in belief state
     */
    _checkContradictions() {
        if (!this.worldModel) return;

        const controversial = this.worldModel.getControversialClaims(20);

        if (controversial.length > this.config.controversyThreshold) {
            this.stats.contradictionsDetected += controversial.length;

            this._emitHint({
                type: HINT_TYPES.PROBE_PRIORITY,
                severity: SEVERITY.WARNING,
                reason: `${controversial.length} contradictory claims detected`,
                affected_subjects: controversial.map(c => c.id),
            });
        }
    }

    /**
     * Check if input features are novel (outside training distribution)
     * @param {string[]} tokens - Input feature tokens
     * @param {object} trainingVocab - Token vocabulary from training
     * @returns {boolean} True if novel
     */
    checkNovelty(tokens, trainingVocab) {
        if (!tokens || !trainingVocab) return false;

        const unknownTokens = tokens.filter(t => !trainingVocab[t]);
        const noveltyRatio = unknownTokens.length / tokens.length;

        if (noveltyRatio > this.config.noveltyThreshold) {
            this.stats.noveltyFlagged++;
            return true;
        }

        return false;
    }

    /**
     * Emit a scheduling hint
     */
    _emitHint(hint) {
        hint.timestamp = Date.now();
        this.activeHints.push(hint);
        this.stats.hintsEmitted++;
    }

    /**
     * Get active hints filtered by minimum severity
     * @param {number} minSeverity - Minimum severity level
     * @returns {object[]} Filtered hints
     */
    getActiveHints(minSeverity = SEVERITY.INFO) {
        return this.activeHints.filter(h => h.severity >= minSeverity);
    }

    /**
     * Clear all active hints
     */
    clearHints() {
        this.activeHints = [];
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats, activeHints: this.activeHints.length };
    }
}
