/**
 * CVSS v3.1 Calculator
 * 
 * Implements the official FIRST.org CVSS v3.1 specification.
 * Supports Vector String parsing and Score calculation.
 */

export class CvssCalculator {
    constructor() {
        this.metrics = {
            AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
            AC: { L: 0.77, H: 0.44 },
            PR: {
                N: 0.85,
                L: { U: 0.62, C: 0.68 },
                H: { U: 0.27, C: 0.5 }
            },
            UI: { N: 0.85, R: 0.62 },
            S: { U: 'Unchanged', C: 'Changed' },
            C: { N: 0.0, L: 0.22, H: 0.56 },
            I: { N: 0.0, L: 0.22, H: 0.56 },
            A: { N: 0.0, L: 0.22, H: 0.56 }
        };
    }

    /**
     * Parse vector string (e.g. CVSS:3.1/AV:N/AC:L...)
     * @param {string} vectorStr 
     */
    parseVector(vectorStr) {
        if (!vectorStr.startsWith('CVSS:3.1/')) {
            throw new Error('Invalid CVSS vector: must start with CVSS:3.1/');
        }

        const components = vectorStr.substring(9).split('/');
        const vector = {};

        for (const comp of components) {
            const [key, value] = comp.split(':');
            if (this.metrics[key] && (this.metrics[key][value] !== undefined || key === 'S' || key === 'PR')) {
                vector[key] = value;
            }
        }

        // Validate required fields
        const required = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'];
        for (const req of required) {
            if (!vector[req]) throw new Error(`Missing required vector component: ${req}`);
        }

        return vector;
    }

    /**
     * Calculate Score
     * @param {string} vectorStr 
     */
    calculateScore(vectorStr) {
        const vector = this.parseVector(vectorStr);

        // Base Metrics
        const AV = this.metrics.AV[vector.AV];
        const AC = this.metrics.AC[vector.AC];
        const UI = this.metrics.UI[vector.UI];
        const C = this.metrics.C[vector.C];
        const I = this.metrics.I[vector.I];
        const A = this.metrics.A[vector.A];

        let PR;
        if (vector.S === 'U') PR = this.metrics.PR[vector.PR].U || this.metrics.PR[vector.PR];
        else PR = this.metrics.PR[vector.PR].C || this.metrics.PR[vector.PR]; // If PR is simple value

        // Handle PR nested object structure for Scope C/U logic properly
        if (typeof this.metrics.PR[vector.PR] === 'object') {
            PR = vector.S === 'U' ? this.metrics.PR[vector.PR].U : this.metrics.PR[vector.PR].C;
        } else {
            PR = this.metrics.PR[vector.PR];
        }

        // Impact Sub-score (ISS)
        const ISS = 1 - ((1 - C) * (1 - I) * (1 - A));

        // Impact
        let Impact;
        if (vector.S === 'U') {
            Impact = vector.S === 'U' ? 6.42 * ISS : 0; // Formula for U
        } else {
            Impact = 7.52 * (ISS - 0.029) - 3.25 * Math.pow(ISS - 0.02, 15);
        }

        // Exploitability
        const Exploitability = 8.22 * AV * AC * PR * UI;

        // Base Score
        let BaseScore;
        if (Impact <= 0) {
            BaseScore = 0;
        } else {
            if (vector.S === 'U') {
                BaseScore = Math.min(10, Impact + Exploitability);
            } else {
                BaseScore = Math.min(10, 1.08 * (Impact + Exploitability));
            }
        }

        // Roundup function (round up to nearest 0.1)
        BaseScore = Math.ceil(BaseScore * 10) / 10;

        return {
            vector: vectorStr,
            score: BaseScore,
            severity: this.getSeverity(BaseScore)
        };
    }

    getSeverity(score) {
        if (score === 0) return 'None';
        if (score < 4.0) return 'Low';
        if (score < 7.0) return 'Medium';
        if (score < 9.0) return 'High';
        return 'Critical';
    }
}

export default new CvssCalculator();
