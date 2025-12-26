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
 * - Uses Arbiter for multi-model consensus when available.
 */

import { fs, path } from 'zx';
import { modelRegistry } from './model-registry.js';
import { arbiter } from './arbiter.js';

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
        this.ruleModel = new RuleModel(); // Always available as fallback
        this.bayesFilterModel = null;
        this.archNetModel = null;
        this.ready = false;
        this.useArbiter = options.useArbiter !== false; // Enable by default
    }

    async init() {
        if (this.ready) return;

        // Register rule model (always available)
        modelRegistry.register('heuristic_v1', { type: 'filter', version: '1.0' });
        modelRegistry.register('heuristic_arch_v1', { type: 'arch', version: '1.0' });

        try {
            const filterModelPath = path.join(this.modelDir, 'filternet-bayes.json');
            if (await fs.pathExists(filterModelPath)) {
                const modelData = await fs.readJson(filterModelPath);
                this.bayesFilterModel = new BayesModel(modelData);
                modelRegistry.register('filternet_bayes_v1', { type: 'filter', version: '1.0' });
            }

            const archModelPath = path.join(this.modelDir, 'archnet-bayes.json');
            if (await fs.pathExists(archModelPath)) {
                const archData = await fs.readJson(archModelPath);
                this.archNetModel = new ArchNetBayes(archData);
                modelRegistry.register('archnet_bayes_v1', { type: 'arch', version: '1.0' });
            }
        } catch (e) {
            console.warn('⚠️ Cortex: Failed to load ML models, using heuristics.', e.message);
        }

        this.ready = true;
    }

    /**
     * Classify a URL as interesting or noise
     * Uses Arbiter for multi-model consensus when available
     */
    predictFilter(url, pathStr) {
        const predictions = [];

        // Collect predictions from all available filter models
        const rulePred = this.ruleModel.predictFilter(url, pathStr);
        predictions.push({
            modelId: 'heuristic_v1',
            label: rulePred.label,
            confidence: rulePred.score,
        });

        if (this.bayesFilterModel) {
            const bayesPred = this.bayesFilterModel.predictFilter(url, pathStr);
            predictions.push({
                modelId: 'filternet_bayes_v1',
                label: bayesPred.label,
                confidence: bayesPred.score,
            });
        }

        // Use arbiter for consensus if enabled and multiple models
        if (this.useArbiter && predictions.length > 1) {
            const consensus = arbiter.arbitrate(predictions);
            return {
                label: consensus.label,
                score: consensus.confidence,
                model: 'arbiter',
                contributing_models: consensus.contributing_models,
                entropy: consensus.entropy,
            };
        }

        // Single model - return directly
        return predictions.length > 0
            ? { label: predictions[0].label, score: predictions[0].confidence, model: predictions[0].modelId }
            : { label: 'signal', score: 0.5, model: 'default' };
    }

    /**
     * Infer architecture from accumulated evidence
     * Uses Arbiter when multiple arch models available
     */
    predictArchitecture(evidence) {
        const predictions = [];

        // Convert endpoints array to features if needed
        const features = this._extractArchFeatures(evidence);

        // Rule-based prediction (works with either format)
        const rulePred = this.ruleModel.predictArchitecture(evidence);
        if (rulePred && rulePred.tags && rulePred.tags.length > 0) {
            predictions.push({
                modelId: 'heuristic_arch_v1',
                label: rulePred.tags[0].label,
                confidence: rulePred.tags[0].score,
            });
        }

        // ML-based prediction (needs features format)
        if (this.archNetModel && features) {
            const mlPred = this.archNetModel.predictArchitecture(features);
            if (mlPred && mlPred.tags && mlPred.tags.length > 0) {
                predictions.push({
                    modelId: 'archnet_bayes_v1',
                    label: mlPred.tags[0].label,
                    confidence: mlPred.tags[0].score,
                });
            }
        }

        // Use arbiter for consensus if enabled and multiple models
        if (this.useArbiter && predictions.length > 1) {
            const consensus = arbiter.arbitrate(predictions);
            return {
                tags: [{ label: consensus.label, score: consensus.confidence }],
                model: 'arbiter',
                contributing_models: consensus.contributing_models,
                entropy: consensus.entropy,
            };
        }

        // Fallback
        if (predictions.length > 0) {
            return {
                tags: [{ label: predictions[0].label, score: predictions[0].confidence }],
                model: predictions[0].modelId,
            };
        }

        return { tags: [], model: 'none' };
    }

    /**
     * Extract features from endpoints array or evidence object
     */
    _extractArchFeatures(evidence) {
        if (!evidence) return null;

        // Already a features object
        if (evidence.headers || evidence.cookies) {
            return evidence;
        }

        // Convert endpoints array to features
        if (Array.isArray(evidence) && evidence.length > 0) {
            const features = {
                url: evidence[0]?.attributes?.path || 'unknown',
                headers: {},
                cookies: [],
                html_tags: [],
            };

            // Extract patterns from paths
            for (const ep of evidence) {
                const path = ep.attributes?.path || '';

                // Detect common frameworks from paths
                if (path.includes('/_next/')) {
                    features.headers['x-framework'] = 'nextjs';
                }
                if (path.includes('/wp-')) {
                    features.headers['x-framework'] = 'wordpress';
                }
                if (path.includes('/graphql')) {
                    features.headers['x-api-type'] = 'graphql';
                }
            }

            return features;
        }

        return null;
    }

    /**
     * Get model registry for external access
     */
    getModelRegistry() {
        return modelRegistry;
    }
}
