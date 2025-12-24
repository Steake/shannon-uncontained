/**
 * The Cortex - Local Inference Engine
 * 
 * Centralized service for "cognitive" tasks:
 * 1. FilterNet: Classifying URLs as Noise vs API (0-1)
 * 2. ArchNet: Fingerprinting architecture from evidence
 * 
 * Uses a Strategy Pattern:
 * - Tries to load TF.js/JSON models from disk.
 * - Falls back to "RuleModel" (Heuristics) if no models found.
 */

import { fs, path } from 'zx';

class RuleModel {
    /**
     * Heuristic-based "Model" that mimics ML output
     */
    predictFilter(url, pathStr) {
        // Known noise patterns (The "Silver Labels")
        const NOISE_PATTERNS = [
            /\/cdn-cgi\//, /\/_next\/static\//, /\/_vercel\//,
            /\.(png|jpg|jpeg|gif|svg|ico|css|woff2?|ttf|eot)$/i,
            /google-analytics/, /googletagmanager/, /segment\.io/,
            /onetrust/, /hotjar/, /doubleclick/, /facebook\.com\/tr/,
            /googleads/, /fbevents/,
        ];

        const isNoise = NOISE_PATTERNS.some(p => p.test(pathStr) || p.test(url));

        return {
            label: isNoise ? 'noise' : 'signal',
            score: isNoise ? 0.99 : 0.6, // Low confidence in signal by default
            model: 'heuristic_v1'
        };
    }

    predictArchitecture(evidence) {
        // Basic signature matching
        const signatures = {
            'Next.js': [/\/_next\//, /__NEXT_DATA__/],
            'Vercel': [/vercel/i, /x-vercel-id/i],
            'WordPress': [/\/wp-content\//, /\/wp-json\//],
            'Express': [/x-powered-by:\s*express/i],
            'GraphQL': [/\/graphql/, /query\s*\{/, /mutation\s*\{/],
        };

        const detected = [];

        // Flatten evidence to searchable strings
        const searchSpace = JSON.stringify(evidence);

        for (const [tech, patterns] of Object.entries(signatures)) {
            if (patterns.some(p => p.test(searchSpace))) {
                detected.push({ label: tech, score: 0.9 });
            }
        }

        return {
            tags: detected,
            model: 'heuristic_v1'
        };
    }
}

export class Cortex {
    constructor(options = {}) {
        this.modelDir = options.modelDir || path.join(process.cwd(), 'models');
        this.activeModel = new RuleModel(); // Default to rules
        this.ready = false;
    }

    async init() {
        if (this.ready) return;

        // TODO: Try loading TF.js model here in future
        // if (await fs.pathExists(path.join(this.modelDir, 'filternet.json'))) { ... }

        this.ready = true;
    }

    /**
     * Classify a URL as interesting or noise
     * @param {string} url - Full URL
     * @param {string} pathStr - Path component
     * @returns {object} { label: 'noise'|'signal', score: number }
     */
    predictFilter(url, pathStr) {
        return this.activeModel.predictFilter(url, pathStr);
    }

    /**
     * Infer architecture from accumulated evidence
     * @param {object} evidence - Evidence object or list
     * @returns {object} { tags: [{label, score}], model: string }
     */
    predictArchitecture(evidence) {
        return this.activeModel.predictArchitecture(evidence);
    }
}
