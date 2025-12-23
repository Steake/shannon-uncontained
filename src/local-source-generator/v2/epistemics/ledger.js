/**
 * Epistemic Ledger - EBSL/EQBSL implementation for LSG v2
 * 
 * Implements:
 * - Subjective Logic opinions (b, d, u, a)
 * - EBSL evidence counts → opinion mapping
 * - EQBSL vector evidence with aggregation functionals
 * - Tool/agent reputation discounting
 * - Calibration metrics
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    K: 2, // Prior weight / normalization constant
    defaultBaseRate: 0.5,

    // Evidence dimensions for LSG
    dimensions: [
        'active_probe_success',
        'active_probe_fail',
        'crawl_observed',
        'crawl_inferred',
        'js_ast_direct',
        'js_ast_heuristic',
        'openapi_fragment',
        'graphql_introspection',
        'har_observed_shape',
        'historical_url_hit',
        'tool_error',
        'timeout',
        'contradiction_count',
    ],

    // Default positive weights (which dimensions contribute to r)
    w_plus: {
        active_probe_success: 1.0,
        crawl_observed: 0.9,
        crawl_inferred: 0.5,
        js_ast_direct: 0.8,
        js_ast_heuristic: 0.4,
        openapi_fragment: 1.0,
        graphql_introspection: 1.0,
        har_observed_shape: 0.9,
        historical_url_hit: 0.6,
    },

    // Default negative weights (which dimensions contribute to s)
    w_minus: {
        active_probe_fail: 1.0,
        tool_error: 0.5,
        timeout: 0.3,
        contradiction_count: 0.8,
    },
};

/**
 * Compute EBSL opinion from evidence counts
 * @param {number} r - Positive evidence
 * @param {number} s - Negative evidence
 * @param {number} K - Prior weight
 * @param {number} a - Base rate
 * @returns {object} Opinion { b, d, u, a }
 */
export function ebslOpinion(r, s, K = 2, a = 0.5) {
    const total = r + s + K;
    return {
        b: r / total,
        d: s / total,
        u: K / total,
        a,
    };
}

/**
 * Compute expected probability from opinion
 * @param {object} opinion - Opinion { b, d, u, a }
 * @returns {number} Expected probability
 */
export function expectedProbability(opinion) {
    return opinion.b + opinion.a * opinion.u;
}

/**
 * Aggregate evidence vector to scalar (r, s)
 * @param {object} evidenceVector - Evidence vector
 * @param {object} wPlus - Positive weights
 * @param {object} wMinus - Negative weights
 * @returns {object} { r, s }
 */
export function aggregateEvidence(evidenceVector, wPlus, wMinus) {
    let r = 0;
    let s = 0;

    for (const [dim, value] of Object.entries(evidenceVector)) {
        if (wPlus[dim]) {
            r += wPlus[dim] * value;
        }
        if (wMinus[dim]) {
            s += wMinus[dim] * value;
        }
    }

    return { r, s };
}

/**
 * Fuse multiple evidence vectors by summation
 * @param {object[]} vectors - Array of evidence vectors
 * @returns {object} Fused evidence vector
 */
export function fuseEvidenceVectors(vectors) {
    const fused = {};

    for (const vector of vectors) {
        for (const [dim, value] of Object.entries(vector)) {
            fused[dim] = (fused[dim] || 0) + value;
        }
    }

    return fused;
}

/**
 * Discount evidence by source reliability
 * @param {object} evidenceVector - Evidence to discount
 * @param {number} reliability - Source reliability (0-1)
 * @returns {object} Discounted evidence vector
 */
export function discountEvidence(evidenceVector, reliability) {
    const discounted = {};

    for (const [dim, value] of Object.entries(evidenceVector)) {
        discounted[dim] = value * reliability;
    }

    return discounted;
}

/**
 * Claim class - typed proposition with opinion
 */
export class Claim {
    constructor({
        id,
        claim_type,
        subject,
        predicate = {},
        evidence_vector = {},
        evidence_refs = [],
        base_rate = 0.5,
    }) {
        this.id = id;
        this.claim_type = claim_type;
        this.subject = subject;
        this.predicate = predicate;
        this.evidence_vector = evidence_vector;
        this.evidence_refs = evidence_refs;
        this.base_rate = base_rate;
        this.created_at = new Date().toISOString();
        this.updated_at = this.created_at;
    }

    /**
     * Get current opinion based on evidence
     * @param {object} config - EQBSL config
     * @returns {object} Opinion
     */
    getOpinion(config = DEFAULT_CONFIG) {
        const { r, s } = aggregateEvidence(
            this.evidence_vector,
            config.w_plus,
            config.w_minus
        );
        return ebslOpinion(r, s, config.K, this.base_rate);
    }

    /**
     * Get expected probability
     * @param {object} config - EQBSL config
     * @returns {number} Expected probability
     */
    getExpectedProbability(config = DEFAULT_CONFIG) {
        return expectedProbability(this.getOpinion(config));
    }

    /**
     * Add evidence to this claim
     * @param {string} dimension - Evidence dimension
     * @param {number} value - Evidence value
     * @param {string} evidenceRef - Reference to source event
     */
    addEvidence(dimension, value, evidenceRef = null) {
        this.evidence_vector[dimension] = (this.evidence_vector[dimension] || 0) + value;
        if (evidenceRef) {
            this.evidence_refs.push(evidenceRef);
        }
        this.updated_at = new Date().toISOString();
    }

    /**
     * Export claim data
     * @param {object} config - EQBSL config
     * @returns {object} Serializable claim
     */
    export(config = DEFAULT_CONFIG) {
        return {
            id: this.id,
            claim_type: this.claim_type,
            subject: this.subject,
            predicate: this.predicate,
            evidence_vector: this.evidence_vector,
            evidence_refs: this.evidence_refs,
            opinion: this.getOpinion(config),
            expected_probability: this.getExpectedProbability(config),
            created_at: this.created_at,
            updated_at: this.updated_at,
        };
    }
}

/**
 * EpistemicLedger class - claim store with EQBSL operations
 */
export class EpistemicLedger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.claims = new Map();           // id -> Claim
        this.claimsByType = new Map();     // type -> Set<id>
        this.claimsBySubject = new Map();  // subject -> Set<id>
        this.sourceReputations = new Map(); // source -> { successes, failures }
    }

    /**
     * Generate claim ID
     * @param {string} claimType - Claim type
     * @param {string} subject - Claim subject
     * @param {object} predicate - Claim predicate
     * @returns {string} Claim ID
     */
    static generateClaimId(claimType, subject, predicate = {}) {
        const predicateStr = Object.entries(predicate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `claim:${claimType}:${subject}:${predicateStr}`;
    }

    /**
     * Generate claim ID (instance proxy)
     */
    generateClaimId(claimType, subject, predicate = {}) {
        return EpistemicLedger.generateClaimId(claimType, subject, predicate);
    }

    /**
     * Create or update a claim
     * @param {object} claimData - Claim data
     * @returns {Claim} The claim
     */
    upsertClaim({ claim_type, subject, predicate = {}, base_rate = 0.5 }) {
        const id = EpistemicLedger.generateClaimId(claim_type, subject, predicate);

        if (this.claims.has(id)) {
            return this.claims.get(id);
        }

        const claim = new Claim({
            id,
            claim_type,
            subject,
            predicate,
            base_rate,
        });

        this.claims.set(id, claim);

        // Index by type
        if (!this.claimsByType.has(claim_type)) {
            this.claimsByType.set(claim_type, new Set());
        }
        this.claimsByType.get(claim_type).add(id);

        // Index by subject
        if (!this.claimsBySubject.has(subject)) {
            this.claimsBySubject.set(subject, new Set());
        }
        this.claimsBySubject.get(subject).add(id);

        return claim;
    }

    /**
     * Add evidence to a claim
     * @param {string} claimId - Claim ID
     * @param {string} dimension - Evidence dimension
     * @param {number} value - Evidence value
     * @param {string} sourceId - Source tool/agent
     * @param {string} evidenceRef - Evidence event reference
     */
    addEvidence(claimId, dimension, value, sourceId = null, evidenceRef = null) {
        const claim = this.claims.get(claimId);
        if (!claim) return;

        // Apply source discounting if available
        let adjustedValue = value;
        if (sourceId) {
            const reliability = this.getSourceReliability(sourceId);
            adjustedValue = value * reliability;
        }

        claim.addEvidence(dimension, adjustedValue, evidenceRef);
    }

    /**
     * Get claim by ID
     * @param {string} id - Claim ID
     * @returns {Claim|null} Claim or null
     */
    getClaim(id) {
        return this.claims.get(id) || null;
    }

    /**
     * Get opinion for a claim
     * @param {string} id - Claim ID
     * @returns {object|null} Opinion or null
     */
    getOpinion(id) {
        const claim = this.claims.get(id);
        return claim ? claim.getOpinion(this.config) : null;
    }

    /**
     * Get all claims of a type
     * @param {string} claimType - Claim type
     * @returns {Claim[]} Array of claims
     */
    getClaimsByType(claimType) {
        const ids = this.claimsByType.get(claimType) || new Set();
        return Array.from(ids).map(id => this.claims.get(id));
    }

    /**
     * Get claims for a subject
     * @param {string} subject - Subject identifier
     * @returns {Claim[]} Array of claims
     */
    getClaimsForSubject(subject) {
        const ids = this.claimsBySubject.get(subject) || new Set();
        return Array.from(ids).map(id => this.claims.get(id));
    }

    /**
     * Get claims above a probability threshold
     * @param {number} threshold - Minimum probability
     * @returns {Claim[]} Claims meeting threshold
     */
    getHighConfidenceClaims(threshold = 0.7) {
        return Array.from(this.claims.values())
            .filter(c => c.getExpectedProbability(this.config) >= threshold);
    }

    /**
     * Get claims with high uncertainty
     * @param {number} threshold - Minimum uncertainty
     * @returns {Claim[]} Uncertain claims
     */
    getUncertainClaims(threshold = 0.5) {
        return Array.from(this.claims.values())
            .filter(c => c.getOpinion(this.config).u >= threshold);
    }

    /**
     * Update source reputation based on validation feedback
     * @param {string} sourceId - Source identifier
     * @param {boolean} wasCorrect - Whether the source was validated as correct
     */
    updateSourceReputation(sourceId, wasCorrect) {
        if (!this.sourceReputations.has(sourceId)) {
            this.sourceReputations.set(sourceId, { successes: 0, failures: 0 });
        }

        const rep = this.sourceReputations.get(sourceId);
        if (wasCorrect) {
            rep.successes++;
        } else {
            rep.failures++;
        }
    }

    /**
     * Get source reliability (for discounting)
     * @param {string} sourceId - Source identifier
     * @returns {number} Reliability (0-1)
     */
    getSourceReliability(sourceId) {
        const rep = this.sourceReputations.get(sourceId);
        if (!rep || (rep.successes + rep.failures === 0)) {
            return 1.0; // No history, assume reliable
        }

        // Use EBSL for source reliability
        const opinion = ebslOpinion(rep.successes, rep.failures, this.config.K, 0.5);
        return expectedProbability(opinion);
    }

    /**
     * Compute calibration metrics (ECE)
     * @param {object[]} validationResults - Array of { claimId, wasCorrect }
     * @returns {object} Calibration metrics
     */
    computeCalibration(validationResults) {
        const bins = Array(10).fill(null).map(() => ({ correct: 0, total: 0, sum: 0 }));

        for (const { claimId, wasCorrect } of validationResults) {
            const claim = this.claims.get(claimId);
            if (!claim) continue;

            const prob = claim.getExpectedProbability(this.config);
            const binIndex = Math.min(Math.floor(prob * 10), 9);

            bins[binIndex].total++;
            bins[binIndex].sum += prob;
            if (wasCorrect) bins[binIndex].correct++;
        }

        // Compute ECE (Expected Calibration Error)
        let ece = 0;
        let totalSamples = 0;

        for (const bin of bins) {
            if (bin.total > 0) {
                const avgProb = bin.sum / bin.total;
                const accuracy = bin.correct / bin.total;
                ece += bin.total * Math.abs(avgProb - accuracy);
                totalSamples += bin.total;
            }
        }

        ece = totalSamples > 0 ? ece / totalSamples : 0;

        return {
            ece,
            bins: bins.map((b, i) => ({
                range: `${i * 10}-${(i + 1) * 10}%`,
                total: b.total,
                accuracy: b.total > 0 ? b.correct / b.total : null,
            })),
        };
    }

    /**
     * Export ledger state
     * @returns {object} Serializable state
     */
    export() {
        return {
            version: '1.0.0',
            config: this.config,
            claims: Array.from(this.claims.values()).map(c => c.export(this.config)),
            source_reputations: Object.fromEntries(this.sourceReputations),
            exported_at: new Date().toISOString(),
        };
    }

    /**
     * Import ledger state
     * @param {object} state - Previously exported state
     */
    import(state) {
        if (state.config) {
            this.config = { ...this.config, ...state.config };
        }

        if (state.claims) {
            for (const claimData of state.claims) {
                const claim = new Claim(claimData);
                this.claims.set(claim.id, claim);

                // Rebuild indices
                if (!this.claimsByType.has(claim.claim_type)) {
                    this.claimsByType.set(claim.claim_type, new Set());
                }
                this.claimsByType.get(claim.claim_type).add(claim.id);

                if (!this.claimsBySubject.has(claim.subject)) {
                    this.claimsBySubject.set(claim.subject, new Set());
                }
                this.claimsBySubject.get(claim.subject).add(claim.id);
            }
        }

        if (state.source_reputations) {
            this.sourceReputations = new Map(Object.entries(state.source_reputations));
        }
    }

    /**
     * Get statistics
     * @returns {object} Ledger statistics
     */
    stats() {
        const claims = Array.from(this.claims.values());
        const opinions = claims.map(c => c.getOpinion(this.config));

        return {
            total_claims: claims.length,
            claim_types: Object.fromEntries(
                Array.from(this.claimsByType.entries()).map(([t, s]) => [t, s.size])
            ),
            avg_belief: opinions.reduce((s, o) => s + o.b, 0) / (opinions.length || 1),
            avg_uncertainty: opinions.reduce((s, o) => s + o.u, 0) / (opinions.length || 1),
            sources_tracked: this.sourceReputations.size,
        };
    }
}

/**
 * Common claim types for LSG
 */
export const CLAIM_TYPES = {
    ENDPOINT_EXISTS: 'endpoint_exists',
    PARAM_TYPE: 'param_type',
    AUTH_MECHANISM: 'auth_mechanism',
    FRAMEWORK: 'framework',
    DATASTORE: 'datastore',
    COMPONENT: 'component',
    DATA_FLOW: 'data_flow',
    VULNERABILITY: 'vulnerability',
};

export default EpistemicLedger;
