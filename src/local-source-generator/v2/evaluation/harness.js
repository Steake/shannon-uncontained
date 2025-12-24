/**
 * Evaluation Harness - Benchmark suite and calibration metrics
 * 
 * Contains:
 * - Benchmark target corpus management
 * - Precision/recall metrics for endpoint discovery
 * - Parameter typing accuracy
 * - Artifact validity rates
 * - Epistemic calibration (ECE)
 */

/**
 * Benchmark target definition
 */
export class BenchmarkTarget {
    constructor({
        id,
        name,
        url,
        category,
        ground_truth = {},
    }) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.category = category; // e.g., 'express_crud', 'fastapi_auth', 'spa_mixed'
        this.ground_truth = {
            endpoints: ground_truth.endpoints || [],
            params: ground_truth.params || {},
            auth: ground_truth.auth || null,
            framework: ground_truth.framework || null,
            ...ground_truth,
        };
    }
}

/**
 * Metric calculator
 */
export class MetricCalculator {
    /**
     * Calculate precision, recall, F1
     * @param {Set} predicted - Predicted items
     * @param {Set} actual - Actual items
     * @returns {object} { precision, recall, f1 }
     */
    static precisionRecallF1(predicted, actual) {
        const predSet = predicted instanceof Set ? predicted : new Set(predicted);
        const actSet = actual instanceof Set ? actual : new Set(actual);

        const truePositives = [...predSet].filter(x => actSet.has(x)).length;
        const precision = predSet.size > 0 ? truePositives / predSet.size : 0;
        const recall = actSet.size > 0 ? truePositives / actSet.size : 0;
        const f1 = precision + recall > 0
            ? 2 * (precision * recall) / (precision + recall)
            : 0;

        return { precision, recall, f1, true_positives: truePositives };
    }

    /**
     * Calculate accuracy
     * @param {number} correct - Correct predictions
     * @param {number} total - Total predictions
     * @returns {number} Accuracy
     */
    static accuracy(correct, total) {
        return total > 0 ? correct / total : 0;
    }

    /**
     * Calculate Expected Calibration Error (ECE)
     * @param {object[]} predictions - Array of { probability, wasCorrect }
     * @param {number} numBins - Number of bins
     * @returns {object} { ece, bins }
     */
    static ece(predictions, numBins = 10) {
        const bins = Array(numBins).fill(null).map(() => ({
            count: 0,
            correct: 0,
            sumProb: 0,
        }));

        for (const { probability, wasCorrect } of predictions) {
            const binIndex = Math.min(Math.floor(probability * numBins), numBins - 1);
            bins[binIndex].count++;
            bins[binIndex].sumProb += probability;
            if (wasCorrect) bins[binIndex].correct++;
        }

        let ece = 0;
        const total = predictions.length;

        const binDetails = bins.map((bin, i) => {
            if (bin.count === 0) {
                return { range: `${i * 10}-${(i + 1) * 10}%`, count: 0, accuracy: null, avgConf: null };
            }

            const accuracy = bin.correct / bin.count;
            const avgConf = bin.sumProb / bin.count;
            ece += (bin.count / total) * Math.abs(avgConf - accuracy);

            return {
                range: `${i * 10}-${(i + 1) * 10}%`,
                count: bin.count,
                accuracy,
                avgConf,
                gap: Math.abs(avgConf - accuracy),
            };
        });

        return { ece, bins: binDetails };
    }
}

/**
 * Evaluation Harness
 */
export class EvaluationHarness {
    constructor() {
        this.targets = new Map();
        this.results = [];
    }

    /**
     * Add benchmark target
     * @param {BenchmarkTarget} target - Target to add
     */
    addTarget(target) {
        this.targets.set(target.id, target);
    }

    /**
     * Evaluate endpoint discovery
     * @param {string} targetId - Target ID
     * @param {object[]} discoveredEndpoints - Discovered endpoints
     * @returns {object} Evaluation result
     */
    evaluateEndpoints(targetId, discoveredEndpoints) {
        const target = this.targets.get(targetId);
        if (!target) return { error: 'Target not found' };

        // Normalize endpoints to comparable format
        const normalize = (ep) => `${ep.method || 'GET'}:${ep.path}`;

        const predicted = new Set(discoveredEndpoints.map(normalize));
        const actual = new Set(target.ground_truth.endpoints.map(normalize));

        const metrics = MetricCalculator.precisionRecallF1(predicted, actual);

        // Calculate false positives and negatives
        const falsePositives = [...predicted].filter(x => !actual.has(x));
        const falseNegatives = [...actual].filter(x => !predicted.has(x));

        const result = {
            target_id: targetId,
            metric_type: 'endpoint_discovery',
            ...metrics,
            predicted_count: predicted.size,
            actual_count: actual.size,
            false_positives: falsePositives,
            false_negatives: falseNegatives,
            timestamp: new Date().toISOString(),
        };

        this.results.push(result);
        return result;
    }

    /**
     * Evaluate parameter typing
     * @param {string} targetId - Target ID
     * @param {object} predictedParams - Predicted params { endpoint: { param: type } }
     * @returns {object} Evaluation result
     */
    evaluateParamTypes(targetId, predictedParams) {
        const target = this.targets.get(targetId);
        if (!target) return { error: 'Target not found' };

        let correct = 0;
        let total = 0;
        const errors = [];

        for (const [endpoint, params] of Object.entries(target.ground_truth.params)) {
            for (const [param, expectedType] of Object.entries(params)) {
                total++;
                const predictedType = predictedParams[endpoint]?.[param];

                if (predictedType === expectedType) {
                    correct++;
                } else {
                    errors.push({
                        endpoint,
                        param,
                        expected: expectedType,
                        predicted: predictedType || 'missing',
                    });
                }
            }
        }

        const result = {
            target_id: targetId,
            metric_type: 'param_typing',
            accuracy: MetricCalculator.accuracy(correct, total),
            correct,
            total,
            errors,
            timestamp: new Date().toISOString(),
        };

        this.results.push(result);
        return result;
    }

    /**
     * Evaluate artifact validity
     * @param {ArtifactManifest} manifest - Artifact manifest
     * @returns {object} Evaluation result
     */
    evaluateArtifactValidity(manifest) {
        const summary = manifest.getValidationSummary();

        const parseRate = summary.parse.passed / (summary.parse.passed + summary.parse.failed) || 0;
        const lintRate = summary.lint.passed / (summary.lint.passed + summary.lint.failed) || 0;
        const typecheckRate = summary.typecheck.passed / (summary.typecheck.passed + summary.typecheck.failed) || 0;
        const buildRate = summary.build.passed / (summary.build.passed + summary.build.failed) || 0;
        const bootRate = summary.runtime.booted / (summary.runtime.booted + summary.runtime.failed) || 0;

        const result = {
            metric_type: 'artifact_validity',
            parse_rate: parseRate,
            lint_rate: lintRate,
            typecheck_rate: typecheckRate,
            build_rate: buildRate,
            boot_rate: bootRate,
            total_artifacts: summary.total,
            summary,
            timestamp: new Date().toISOString(),
        };

        this.results.push(result);
        return result;
    }

    /**
     * Evaluate epistemic calibration
     * @param {EpistemicLedger} ledger - Epistemic ledger
     * @param {object[]} validationResults - Ground truth { claimId, wasCorrect }
     * @returns {object} Calibration metrics
     */
    evaluateCalibration(ledger, validationResults) {
        // Get predictions with probabilities
        const predictions = validationResults.map(({ claimId, wasCorrect }) => {
            const claim = ledger.getClaim(claimId);
            return {
                claimId,
                probability: claim ? claim.getExpectedProbability(ledger.config) : 0.5,
                wasCorrect,
            };
        });

        const { ece, bins } = MetricCalculator.ece(predictions);

        const result = {
            metric_type: 'calibration',
            ece,
            bins,
            sample_size: predictions.length,
            timestamp: new Date().toISOString(),
        };

        this.results.push(result);
        return result;
    }

    /**
     * Run full evaluation suite
     * @param {string} targetId - Target ID
     * @param {object} outputs - LSG outputs
     * @returns {object} Full evaluation
     */
    runFullEvaluation(targetId, outputs) {
        const results = {};

        if (outputs.endpoints) {
            results.endpoints = this.evaluateEndpoints(targetId, outputs.endpoints);
        }

        if (outputs.params) {
            results.params = this.evaluateParamTypes(targetId, outputs.params);
        }

        if (outputs.manifest) {
            results.artifacts = this.evaluateArtifactValidity(outputs.manifest);
        }

        if (outputs.ledger && outputs.validationResults) {
            results.calibration = this.evaluateCalibration(outputs.ledger, outputs.validationResults);
        }

        return {
            target_id: targetId,
            timestamp: new Date().toISOString(),
            results,
        };
    }

    /**
     * Get aggregate metrics across all results
     * @returns {object} Aggregate metrics
     */
    getAggregateMetrics() {
        const byType = {};

        for (const result of this.results) {
            if (!byType[result.metric_type]) {
                byType[result.metric_type] = [];
            }
            byType[result.metric_type].push(result);
        }

        const aggregates = {};

        // Aggregate endpoint discovery
        if (byType.endpoint_discovery) {
            const eps = byType.endpoint_discovery;
            aggregates.endpoint_discovery = {
                avg_precision: eps.reduce((s, r) => s + r.precision, 0) / eps.length,
                avg_recall: eps.reduce((s, r) => s + r.recall, 0) / eps.length,
                avg_f1: eps.reduce((s, r) => s + r.f1, 0) / eps.length,
                sample_count: eps.length,
            };
        }

        // Aggregate param typing
        if (byType.param_typing) {
            const pts = byType.param_typing;
            aggregates.param_typing = {
                avg_accuracy: pts.reduce((s, r) => s + r.accuracy, 0) / pts.length,
                total_correct: pts.reduce((s, r) => s + r.correct, 0),
                total_params: pts.reduce((s, r) => s + r.total, 0),
                sample_count: pts.length,
            };
        }

        // Aggregate calibration
        if (byType.calibration) {
            const cals = byType.calibration;
            aggregates.calibration = {
                avg_ece: cals.reduce((s, r) => s + r.ece, 0) / cals.length,
                sample_count: cals.length,
            };
        }

        return aggregates;
    }

    /**
     * Export results
     * @returns {object} Exportable results
     */
    export() {
        return {
            version: '1.0.0',
            exported_at: new Date().toISOString(),
            targets: Array.from(this.targets.values()),
            results: this.results,
            aggregates: this.getAggregateMetrics(),
        };
    }
}

/**
 * Create standard benchmark corpus
 * @returns {BenchmarkTarget[]} Benchmark targets
 */
export function createStandardCorpus() {
    return [
        new BenchmarkTarget({
            id: 'express_crud_basic',
            name: 'Express CRUD API',
            url: 'http://localhost:3000',
            category: 'express_crud',
            ground_truth: {
                endpoints: [
                    { method: 'GET', path: '/api/users' },
                    { method: 'POST', path: '/api/users' },
                    { method: 'GET', path: '/api/users/:id' },
                    { method: 'PUT', path: '/api/users/:id' },
                    { method: 'DELETE', path: '/api/users/:id' },
                ],
                params: {
                    'POST:/api/users': { email: 'string', password: 'string', name: 'string' },
                    'PUT:/api/users/:id': { email: 'string', name: 'string' },
                },
                auth: { mechanism: 'jwt', storage: 'header' },
                framework: 'express',
            },
        }),
        new BenchmarkTarget({
            id: 'fastapi_auth',
            name: 'FastAPI with Auth',
            url: 'http://localhost:8000',
            category: 'fastapi_auth',
            ground_truth: {
                endpoints: [
                    { method: 'POST', path: '/auth/login' },
                    { method: 'POST', path: '/auth/register' },
                    { method: 'GET', path: '/users/me' },
                    { method: 'GET', path: '/items' },
                    { method: 'POST', path: '/items' },
                ],
                auth: { mechanism: 'oauth2', storage: 'header' },
                framework: 'fastapi',
            },
        }),
        new BenchmarkTarget({
            id: 'spa_mixed',
            name: 'React SPA + REST API',
            url: 'http://localhost:5173',
            category: 'spa_mixed',
            ground_truth: {
                endpoints: [
                    { method: 'GET', path: '/api/products' },
                    { method: 'GET', path: '/api/products/:id' },
                    { method: 'POST', path: '/api/cart' },
                    { method: 'GET', path: '/api/cart' },
                ],
                framework: 'react',
            },
        }),
    ];
}

export default EvaluationHarness;
