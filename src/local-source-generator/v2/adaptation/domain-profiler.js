/**
 * DomainProfiler - Target domain characterization and drift detection
 * 
 * Enables domain adaptation without retraining:
 * - Profiles new targets on first run
 * - Detects drift from baseline
 * - Stores profiles for persistence across runs
 */

import { fs, path } from 'zx';

export class DomainProfiler {
    constructor(options = {}) {
        this.profileDir = options.profileDir || path.join(process.cwd(), 'domain-profiles');
        this.profiles = new Map(); // domain -> DomainProfile
        this.driftThreshold = options.driftThreshold || 0.3;
    }

    /**
     * Initialize profiler and load existing profiles
     */
    async init() {
        try {
            await fs.ensureDir(this.profileDir);

            const files = await fs.readdir(this.profileDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const profile = await fs.readJson(path.join(this.profileDir, file));
                    this.profiles.set(profile.domain, profile);
                }
            }
        } catch (e) {
            // Continue without existing profiles
        }
    }

    /**
     * Check if domain has an existing profile
     * @param {string} domain - Target domain
     * @returns {boolean}
     */
    hasProfile(domain) {
        return this.profiles.has(this._normalizeDomain(domain));
    }

    /**
     * Get existing profile for domain
     * @param {string} domain - Target domain
     * @returns {object|null}
     */
    getProfile(domain) {
        return this.profiles.get(this._normalizeDomain(domain)) || null;
    }

    /**
     * Create baseline profile for new domain
     * @param {string} domain - Target domain
     * @param {object} metrics - Initial metrics
     */
    async createProfile(domain, metrics) {
        const normalizedDomain = this._normalizeDomain(domain);

        const profile = {
            domain: normalizedDomain,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            runs: 1,
            baseline: {
                probe_success_rate: metrics.probeSuccessRate || 0,
                avg_claim_confidence: metrics.avgClaimConfidence || 0.5,
                tech_distribution: metrics.techDistribution || {},
                endpoint_count: metrics.endpointCount || 0,
            },
            current: null,
            drift_score: 0,
        };

        this.profiles.set(normalizedDomain, profile);
        await this._saveProfile(profile);

        return profile;
    }

    /**
     * Update profile with current run metrics
     * @param {string} domain - Target domain
     * @param {object} metrics - Current metrics
     * @returns {object} Updated profile with drift score
     */
    async updateProfile(domain, metrics) {
        const normalizedDomain = this._normalizeDomain(domain);
        const profile = this.profiles.get(normalizedDomain);

        if (!profile) {
            return this.createProfile(domain, metrics);
        }

        profile.runs++;
        profile.updated_at = new Date().toISOString();
        profile.current = {
            probe_success_rate: metrics.probeSuccessRate || 0,
            avg_claim_confidence: metrics.avgClaimConfidence || 0.5,
            tech_distribution: metrics.techDistribution || {},
            endpoint_count: metrics.endpointCount || 0,
        };

        // Calculate drift
        profile.drift_score = this._calculateDrift(profile.baseline, profile.current);

        await this._saveProfile(profile);

        return profile;
    }

    /**
     * Check if domain has drifted beyond threshold
     * @param {string} domain - Target domain
     * @returns {boolean}
     */
    hasDrifted(domain) {
        const profile = this.getProfile(domain);
        return profile && profile.drift_score > this.driftThreshold;
    }

    /**
     * Calculate drift score between baseline and current metrics
     * @param {object} baseline - Baseline metrics
     * @param {object} current - Current metrics
     * @returns {number} Drift score 0-1
     */
    _calculateDrift(baseline, current) {
        if (!baseline || !current) return 0;

        const diffs = [];

        // Compare probe success rate
        if (baseline.probe_success_rate > 0) {
            const probeDiff = Math.abs(current.probe_success_rate - baseline.probe_success_rate);
            diffs.push(probeDiff);
        }

        // Compare confidence
        const confDiff = Math.abs(current.avg_claim_confidence - baseline.avg_claim_confidence);
        diffs.push(confDiff);

        // Compare endpoint count (normalized)
        if (baseline.endpoint_count > 0) {
            const endpointRatio = current.endpoint_count / baseline.endpoint_count;
            const endpointDiff = Math.abs(1 - Math.min(endpointRatio, 2));
            diffs.push(endpointDiff / 2); // Normalize to 0-1
        }

        // Average drift
        return diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    }

    /**
     * Normalize domain string
     */
    _normalizeDomain(domain) {
        try {
            const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
            return url.hostname.replace(/^www\./, '');
        } catch {
            return domain.toLowerCase().replace(/[^a-z0-9.-]/g, '');
        }
    }

    /**
     * Save profile to disk
     */
    async _saveProfile(profile) {
        const filename = `${profile.domain.replace(/[^a-z0-9.-]/g, '_')}.json`;
        await fs.writeJson(path.join(this.profileDir, filename), profile, { spaces: 2 });
    }

    /**
     * Get all profiles
     * @returns {object[]}
     */
    getAllProfiles() {
        return Array.from(this.profiles.values());
    }

    /**
     * Get statistics
     */
    stats() {
        const profiles = this.getAllProfiles();
        const drifted = profiles.filter(p => p.drift_score > this.driftThreshold);

        return {
            total_profiles: profiles.length,
            drifted_domains: drifted.length,
            avg_drift: profiles.length > 0
                ? profiles.reduce((sum, p) => sum + (p.drift_score || 0), 0) / profiles.length
                : 0,
        };
    }
}
