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


// Utility for BayesModel
function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase().split(/[^a-z0-9]/).filter(t => t.length > 2);
}

class BayesModel {
    constructor(data) {
        this.vocab = data.vocab;
        this.classes = data.classes;
        this.totalDocs = data.totalDocs;
    }

    predictFilter(url, pathStr) {
        // Use path as primary feature
        const text = pathStr || url;
        const tokens = tokenize(text);

        let scoreNoise = Math.log(this.classes.noise / this.totalDocs);
        let scoreSignal = Math.log(this.classes.signal / this.totalDocs);

        for (const token of tokens) {
            if (this.vocab[token]) {
                // Laplacian smoothing (+1)
                const probNoise = (this.vocab[token].noise + 1) / (this.classes.noise + 2);
                const probSignal = (this.vocab[token].signal + 1) / (this.classes.signal + 2);

                scoreNoise += Math.log(probNoise);
                scoreSignal += Math.log(probSignal);
            }
        }

        const isSignal = scoreSignal > scoreNoise;

        // Calculate a rough confidence score (difference in log probs)
        const diff = Math.abs(scoreSignal - scoreNoise);
        const confidence = Math.min(0.5 + (diff / 10), 0.99); // Sigmoid-ish scaling

        return {
            label: isSignal ? 'signal' : 'noise',
            score: confidence,
            model: 'filternet_bayes_v1'
        };
    }

    predictArchitecture(evidence) {
        // BayesModel only does filtering for now
        // Fallback to RuleModel or empty
        return null;
    }
}


class ArchNetBayes {
    constructor(data) {
        this.featureCounts = data.featureCounts;
        this.classCounts = data.classCounts;
        this.totalDocs = data.totalDocs;
    }

    extractTokens(features) {
        const tokens = [];
        if (features.headers) {
            for (const [k, v] of Object.entries(features.headers)) {
                tokens.push(`header:${k.toLowerCase()}`);
                if (['server', 'x-powered-by', 'via'].includes(k.toLowerCase())) {
                    tokens.push(`header:${k.toLowerCase()}=${v.toLowerCase()}`);
                }
            }
        }
        if (features.cookies) tokens.push(...features.cookies.map(c => `cookie:${c.name.toLowerCase()}`));
        if (features.html_tags) tokens.push(...features.html_tags.map(t => `tag:${t.toLowerCase()}`));
        if (features.url) tokens.push(`url:${features.url}`); // Simple feature
        return tokens;
    }

    predictArchitecture(evidence) {
        // Evidence is usually a list of endpoints or an object. 
        // ArchNet expects features object: { headers, cookies... }
        // We need to map 'evidence' (which might be raw events) to 'features'
        // For simplicity, we assume 'evidence' *contains* the features or we extract basic ones.

        // In this implementation, we handle the case where evidence is the Endpoint list (from ArchitectInferAgent)
        // This model is trained on TechDetection events, which are different.
        // So we adapt: if evidence is array, we look for headers in it?
        // Actually, ArchitectInferAgent calls: predictArchitecture(endpoints)

        // We really need 'features'. 
        // TEMPORARY: Return null if features missing, fallback to heuristics.
        if (!evidence || (!evidence.headers && !Array.isArray(evidence))) return null;

        // Mock conversion if array (assuming endpoint list has no headers usually)
        const features = Array.isArray(evidence) ? { url: 'unknown' } : evidence;

        const tokens = this.extractTokens(features);
        let bestClass = null;
        let maxScore = -Infinity;
        const classes = Object.keys(this.classCounts);

        for (const cls of classes) {
            let score = Math.log(this.classCounts[cls] / this.totalDocs);
            for (const token of tokens) {
                if (this.featureCounts[token]) {
                    const count = this.featureCounts[token][cls] || 0;
                    const prob = (count + 1) / (this.classCounts[cls] + 2);
                    score += Math.log(prob);
                }
            }
            if (score > maxScore) {
                maxScore = score;
                bestClass = cls;
            }
        }

        if (!bestClass) return null;

        return {
            tags: [{ label: bestClass, score: Math.min(Math.exp(maxScore), 0.99) }],
            model: 'archnet_bayes_v1'
        };
    }

    predictFilter() { return null; }
}

export class Cortex {
    constructor(options = {}) {
        this.modelDir = options.modelDir || path.join(process.cwd(), 'models');
        this.ruleModel = new RuleModel(); // Always available
        this.activeFilterModel = this.ruleModel;
        this.activeArchModel = this.ruleModel;
        this.ready = false;
    }

    async init() {
        if (this.ready) return;

        try {
            const filterModelPath = path.join(this.modelDir, 'filternet-bayes.json');
            if (await fs.pathExists(filterModelPath)) {
                const modelData = await fs.readJson(filterModelPath);
                this.activeFilterModel = new BayesModel(modelData);
            }

            const archModelPath = path.join(this.modelDir, 'archnet-bayes.json');
            if (await fs.pathExists(archModelPath)) {
                const archData = await fs.readJson(archModelPath);
                this.activeArchModel = new ArchNetBayes(archData);
            }
        } catch (e) {
            console.warn('⚠️ Cortex: Failed to load ML models, using heuristics.', e.message);
        }

        this.ready = true;
    }

    /**
     * Classify a URL as interesting or noise
     */
    predictFilter(url, pathStr) {
        return this.activeFilterModel.predictFilter(url, pathStr);
    }

    /**
     * Infer architecture from accumulated evidence
     */
    predictArchitecture(evidence) {
        // Try ML model first
        const result = this.activeArchModel.predictArchitecture(evidence);
        if (result) return result;

        // Fallback to rules if ML returns null (low confidence or missing features)
        return this.ruleModel.predictArchitecture(evidence);
    }
}
