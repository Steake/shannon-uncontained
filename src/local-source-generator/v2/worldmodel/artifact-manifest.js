/**
 * ArtifactManifest - Output tracking with validation results and trace links
 * 
 * Every generated artifact is tracked with:
 * - Generated from (TargetModel nodes + Claim IDs)
 * - Evidence references
 * - Epistemic envelope (opinion + uncertainties)
 * - Validation results (parse/lint/typecheck/build/runtime)
 * - Build reproducibility (input hashes + config snapshot)
 */

import { createHash } from 'crypto';

/**
 * Validation stages
 */
export const VALIDATION_STAGES = {
    PARSE: 'parse',
    LINT: 'lint',
    TYPECHECK: 'typecheck',
    BUILD: 'build',
    RUNTIME: 'runtime',
};

/**
 * ArtifactManifest class - output registry
 */
export class ArtifactManifest {
    constructor() {
        this.entries = new Map();       // path -> ArtifactEntry
        this.entriesByClaim = new Map(); // claim_id -> Set<path>
    }

    /**
     * Register an artifact
     * @param {object} entry - Artifact entry data
     * @returns {string} Artifact path
     */
    addEntry({
        path,
        generated_from = [],
        evidence_refs = [],
        epistemic = null,
        validation = null,
        build_repro = null,
    }) {
        const entry = {
            path,
            generated_from,
            evidence_refs,
            epistemic: epistemic || {
                overall_opinion: { b: 0, d: 0, u: 1, a: 0.5 },
                uncertainties: [],
            },
            validation: validation || {
                parse: null,
                lint: null,
                typecheck: null,
                build: null,
                runtime: null,
            },
            build_repro: build_repro || {
                input_hashes: {},
                config_snapshot: {},
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        this.entries.set(path, entry);

        // Index by claims
        for (const ref of generated_from) {
            if (ref.startsWith('claim:')) {
                if (!this.entriesByClaim.has(ref)) {
                    this.entriesByClaim.set(ref, new Set());
                }
                this.entriesByClaim.get(ref).add(path);
            }
        }

        return path;
    }

    /**
     * Get artifact entry by path
     * @param {string} path - Artifact path
     * @returns {object|null} Entry or null
     */
    getEntry(path) {
        return this.entries.get(path) || null;
    }

    /**
     * Update validation result for an artifact
     * @param {string} path - Artifact path
     * @param {string} stage - Validation stage
     * @param {object} result - Validation result
     */
    updateValidation(path, stage, result) {
        const entry = this.entries.get(path);
        if (!entry) return;

        entry.validation[stage] = result;
        entry.updated_at = new Date().toISOString();
    }

    /**
     * Set parse validation result
     * @param {string} path - Artifact path
     * @param {boolean} passed - Whether parse succeeded
     * @param {string[]} errors - Parse errors if any
     */
    setParseResult(path, passed, errors = []) {
        this.updateValidation(path, VALIDATION_STAGES.PARSE, { passed, errors });
    }

    /**
     * Set lint validation result
     * @param {string} path - Artifact path
     * @param {boolean} passed - Whether lint passed
     * @param {object[]} issues - Lint issues
     */
    setLintResult(path, passed, issues = []) {
        this.updateValidation(path, VALIDATION_STAGES.LINT, { passed, issues });
    }

    /**
     * Set typecheck validation result
     * @param {string} path - Artifact path
     * @param {boolean} passed - Whether typecheck passed
     * @param {object[]} errors - Type errors
     */
    setTypecheckResult(path, passed, errors = []) {
        this.updateValidation(path, VALIDATION_STAGES.TYPECHECK, { passed, errors });
    }

    /**
     * Set build validation result
     * @param {string} path - Artifact path
     * @param {boolean} passed - Whether build succeeded
     * @param {string[]} errors - Build errors
     */
    setBuildResult(path, passed, errors = []) {
        this.updateValidation(path, VALIDATION_STAGES.BUILD, { passed, errors });
    }

    /**
     * Set runtime validation result
     * @param {string} path - Artifact path
     * @param {boolean} booted - Whether app booted
     * @param {number} endpointsTested - Number of endpoints tested
     * @param {object[]} results - Endpoint test results
     */
    setRuntimeResult(path, booted, endpointsTested = 0, results = []) {
        this.updateValidation(path, VALIDATION_STAGES.RUNTIME, {
            booted,
            endpoints_tested: endpointsTested,
            results,
        });
    }

    /**
     * Update epistemic envelope
     * @param {string} path - Artifact path
     * @param {object} epistemic - New epistemic data
     */
    updateEpistemic(path, epistemic) {
        const entry = this.entries.get(path);
        if (!entry) return;

        entry.epistemic = {
            ...entry.epistemic,
            ...epistemic,
        };
        entry.updated_at = new Date().toISOString();
    }

    /**
     * Add uncertainty to artifact
     * @param {string} path - Artifact path
     * @param {string} uncertainty - Uncertainty description
     */
    addUncertainty(path, uncertainty) {
        const entry = this.entries.get(path);
        if (!entry) return;

        entry.epistemic.uncertainties.push(uncertainty);
        entry.updated_at = new Date().toISOString();
    }

    /**
     * Get all artifacts generated from a claim
     * @param {string} claimId - Claim ID
     * @returns {object[]} Array of artifact entries
     */
    getArtifactsByClaim(claimId) {
        const paths = this.entriesByClaim.get(claimId) || new Set();
        return Array.from(paths).map(p => this.entries.get(p));
    }

    /**
     * Get validation summary across all artifacts
     * @returns {object} Summary statistics
     */
    getValidationSummary() {
        const summary = {
            total: this.entries.size,
            parse: { passed: 0, failed: 0, pending: 0 },
            lint: { passed: 0, failed: 0, pending: 0 },
            typecheck: { passed: 0, failed: 0, pending: 0 },
            build: { passed: 0, failed: 0, pending: 0 },
            runtime: { booted: 0, failed: 0, pending: 0 },
        };

        for (const entry of this.entries.values()) {
            for (const stage of Object.values(VALIDATION_STAGES)) {
                const result = entry.validation[stage];
                if (result === null) {
                    summary[stage].pending++;
                } else if (stage === 'runtime') {
                    if (result.booted) summary[stage].booted++;
                    else summary[stage].failed++;
                } else {
                    if (result.passed) summary[stage].passed++;
                    else summary[stage].failed++;
                }
            }
        }

        return summary;
    }

    /**
     * Get artifacts with validation failures
     * @returns {object[]} Failed artifacts with failure details
     */
    getFailedArtifacts() {
        const failed = [];

        for (const entry of this.entries.values()) {
            const failures = [];
            for (const [stage, result] of Object.entries(entry.validation)) {
                if (result && !result.passed && stage !== 'runtime') {
                    failures.push({ stage, errors: result.errors || result.issues });
                }
                if (result && stage === 'runtime' && !result.booted) {
                    failures.push({ stage, errors: ['Failed to boot'] });
                }
            }

            if (failures.length > 0) {
                failed.push({ path: entry.path, failures });
            }
        }

        return failed;
    }

    /**
     * Compute build reproducibility hash
     * @param {object} inputs - Input data
     * @param {object} config - Configuration
     * @returns {object} Build repro record
     */
    static computeBuildRepro(inputs, config) {
        const inputHashes = {};
        for (const [key, value] of Object.entries(inputs)) {
            const hash = createHash('sha256')
                .update(JSON.stringify(value))
                .digest('hex')
                .slice(0, 16);
            inputHashes[key] = hash;
        }

        return {
            input_hashes: inputHashes,
            config_snapshot: { ...config },
            computed_at: new Date().toISOString(),
        };
    }

    /**
     * Export manifest
     * @returns {object} Serializable state
     */
    export() {
        return {
            version: '1.0.0',
            exported_at: new Date().toISOString(),
            entries: Array.from(this.entries.values()),
            summary: this.getValidationSummary(),
        };
    }

    /**
     * Import manifest state
     * @param {object} state - Previously exported state
     */
    import(state) {
        if (state.entries) {
            for (const entry of state.entries) {
                this.addEntry(entry);
            }
        }
    }
}

/**
 * Create epistemic envelope for artifact
 * @param {object} opinion - Overall opinion
 * @param {string[]} claimRefs - Claim references
 * @param {string[]} evidenceRefs - Evidence references
 * @param {string[]} uncertainties - Explicit uncertainties
 * @returns {object} Epistemic envelope
 */
export function createEpistemicEnvelope(opinion, claimRefs = [], evidenceRefs = [], uncertainties = []) {
    return {
        overall_opinion: opinion,
        claim_refs: claimRefs,
        evidence_refs: evidenceRefs,
        uncertainties,
    };
}

export default ArtifactManifest;
