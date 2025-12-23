/**
 * VulnHypothesizer - Vulnerability hypothesis generation agent
 * 
 * Generates prioritized vulnerability hypotheses grounded in
 * discovered flows, claims, and OWASP patterns.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class VulnHypothesizer extends BaseAgent {
    constructor(options = {}) {
        super('VulnHypothesizer', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string' },
                sourceDir: {
                    type: 'string',
                    description: 'Path to LSG source directory for ground-truth validation'
                },
                applyGroundTruth: {
                    type: 'boolean',
                    default: true,
                    description: 'Filter hypotheses by ground-truth validation results'
                }
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                hypotheses: { type: 'array' },
                priority_queue: { type: 'array' },
                groundTruthFiltered: { type: 'number' },
            },
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered', 'tech_detection', 'ground_truth_probed'],
            model_nodes: ['endpoint', 'component', 'auth_flow'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: [],
            claims: [CLAIM_TYPES.VULNERABILITY],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 5,
            max_tokens: 10000,
            max_tool_invocations: 5,
        };

        this.llm = getLLMClient();

        // OWASP Top 10 2021 patterns
        this.owaspPatterns = {
            A01_BROKEN_ACCESS_CONTROL: {
                patterns: [/\/admin/, /\/user\/\d+/, /\/api\/v\d+\/.*\/\d+/, /role=/, /isAdmin/],
                indicators: ['Missing auth on admin endpoint', 'IDOR pattern', 'Privilege escalation'],
            },
            A02_CRYPTOGRAPHIC_FAILURES: {
                patterns: [/http:\/\//, /password/, /secret/, /token/, /\.pem/, /\.key/],
                indicators: ['Plaintext transmission', 'Exposed secrets', 'Weak encryption'],
            },
            A03_INJECTION: {
                patterns: [/search/, /query/, /filter/, /sort/, /id=/, /name=/],
                indicators: ['User input in query', 'Dynamic SQL', 'Template injection'],
            },
            A04_INSECURE_DESIGN: {
                patterns: [/reset/, /forgot/, /verify/, /confirm/],
                indicators: ['Predictable tokens', 'Missing rate limiting', 'Business logic flaws'],
            },
            A05_SECURITY_MISCONFIGURATION: {
                patterns: [/debug/, /trace/, /test/, /staging/, /\.env/, /config/],
                indicators: ['Debug mode', 'Default credentials', 'Exposed configs'],
            },
            A06_VULNERABLE_COMPONENTS: {
                patterns: [],
                indicators: ['Outdated frameworks', 'Known CVEs', 'Unpatched libraries'],
            },
            A07_AUTH_FAILURES: {
                patterns: [/login/, /session/, /jwt/, /cookie/, /token/],
                indicators: ['Weak passwords allowed', 'Missing MFA', 'Session fixation'],
            },
            A08_SOFTWARE_DATA_INTEGRITY: {
                patterns: [/update/, /upgrade/, /plugin/, /import/, /deserialize/],
                indicators: ['Unsigned updates', 'Insecure deserialization', 'CI/CD injection'],
            },
            A09_LOGGING_MONITORING: {
                patterns: [/log/, /audit/, /monitor/],
                indicators: ['Missing logging', 'No alerting', 'Log injection'],
            },
            A10_SSRF: {
                patterns: [/url=/, /fetch/, /proxy/, /redirect/, /callback/],
                indicators: ['URL parameter', 'Proxy endpoint', 'Redirect without validation'],
            },
        };
    }

    async run(ctx, inputs) {
        const { target, sourceDir, applyGroundTruth = true } = inputs;

        const results = {
            hypotheses: [],
            priority_queue: [],
            owasp_coverage: {},
            groundTruthFiltered: 0,
        };

        // Load ground-truth validation if available
        let groundTruthMap = new Map();
        if (applyGroundTruth && sourceDir) {
            groundTruthMap = await this.loadGroundTruth(sourceDir);
        }

        // Gather evidence
        let endpoints = ctx.targetModel.getEndpoints();

        // Filter endpoints by ground-truth accessibility
        if (groundTruthMap.size > 0) {
            const originalCount = endpoints.length;
            endpoints = endpoints.filter(ep => {
                const path = ep.attributes.path || '';
                const gtResult = groundTruthMap.get(path);

                // Keep if: no ground-truth data, or accessible
                if (!gtResult) return true;

                const accessible = gtResult.classification === 'ACCESSIBLE' ||
                    gtResult.classification === 'REDIRECT';

                if (!accessible) {
                    // Update claim confidence via ledger for filtered endpoints
                    const claimId = ctx.ledger.generateClaimId('vulnerability_hypothesized', path);
                    if (ctx.ledger.getClaim(claimId)) {
                        ctx.ledger.addEvidence(claimId, 'active_probe_fail', 1.0, 'ground-truth-filter');
                    }
                }

                return accessible;
            });
            results.groundTruthFiltered = originalCount - endpoints.length;
        }

        const dataFlowClaims = ctx.ledger.getClaimsByType(CLAIM_TYPES.DATA_FLOW);
        const authClaims = ctx.ledger.getClaimsByType(CLAIM_TYPES.AUTH_MECHANISM);
        const techEvents = ctx.evidenceGraph.getEventsByType('tech_detection');

        // Pattern-based hypothesis generation (on filtered endpoints)
        const patternHypotheses = this.generatePatternHypotheses(endpoints);

        // Use LLM for deeper analysis
        ctx.recordTokens(2000);

        const prompt = this.buildPrompt(
            target,
            endpoints,
            dataFlowClaims,
            authClaims,
            techEvents,
            patternHypotheses
        );

        const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
            capability: LLM_CAPABILITIES.EXTRACT_CLAIMS,
        });

        if (response.success && response.data) {
            ctx.recordTokens(response.tokens_used);

            for (const hypothesis of response.data.hypotheses || []) {
                results.hypotheses.push(hypothesis);

                // Emit claim for each hypothesis
                const claim = ctx.emitClaim({
                    claim_type: CLAIM_TYPES.VULNERABILITY,
                    subject: hypothesis.endpoint || target,
                    predicate: {
                        vuln_type: hypothesis.owasp_category,
                        name: hypothesis.name,
                        severity: hypothesis.severity,
                    },
                    base_rate: 0.1, // Very conservative for vuln hypotheses
                });

                if (claim) {
                    // Evidence based on supporting factors
                    const evidenceStrength = (hypothesis.confidence || 0.3) *
                        (hypothesis.supporting_evidence?.length || 1) * 0.3;
                    claim.addEvidence('crawl_inferred', evidenceStrength);
                }
            }
        }

        // Merge with pattern hypotheses
        for (const ph of patternHypotheses) {
            if (!results.hypotheses.find(h => h.endpoint === ph.endpoint && h.owasp_category === ph.owasp_category)) {
                results.hypotheses.push(ph);
            }
        }

        // Build priority queue
        results.priority_queue = this.buildPriorityQueue(results.hypotheses);

        // Calculate OWASP coverage
        for (const category of Object.keys(this.owaspPatterns)) {
            results.owasp_coverage[category] = results.hypotheses.filter(
                h => h.owasp_category === category
            ).length;
        }

        return results;
    }

    /**
     * Load ground-truth validation results from JSON file
     * @param {string} sourceDir - Path to LSG source directory
     * @returns {Map} Map of path -> { status, classification, authRequired }
     */
    async loadGroundTruth(sourceDir) {
        const groundTruthMap = new Map();

        try {
            const { fs, path } = await import('zx');
            const gtPath = path.join(sourceDir, 'deliverables', 'ground_truth_validation.json');

            if (await fs.pathExists(gtPath)) {
                const data = await fs.readJson(gtPath);

                for (const result of data.probeResults || []) {
                    const route = result.route || new URL(result.url).pathname;
                    groundTruthMap.set(route, {
                        status: result.status,
                        classification: result.behavior?.classification || result.classification,
                        authRequired: result.behavior?.authRequired || false
                    });
                }
            }
        } catch (error) {
            // Ground-truth file not available, continue without filtering
        }

        return groundTruthMap;
    }

    generatePatternHypotheses(endpoints) {
        const hypotheses = [];

        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const method = endpoint.attributes.method || 'GET';

            for (const [category, { patterns, indicators }] of Object.entries(this.owaspPatterns)) {
                for (const pattern of patterns) {
                    if (pattern.test(path)) {
                        hypotheses.push({
                            endpoint: path,
                            method,
                            owasp_category: category,
                            name: `Potential ${category.replace('_', ' ')} in ${path}`,
                            severity: this.categorySeverity(category),
                            confidence: 0.3,
                            source: 'pattern_match',
                            supporting_evidence: [indicators[0]],
                        });
                        break; // One match per category per endpoint
                    }
                }
            }
        }

        return hypotheses;
    }

    categorySeverity(category) {
        const severityMap = {
            A01_BROKEN_ACCESS_CONTROL: 'critical',
            A02_CRYPTOGRAPHIC_FAILURES: 'high',
            A03_INJECTION: 'critical',
            A04_INSECURE_DESIGN: 'high',
            A05_SECURITY_MISCONFIGURATION: 'medium',
            A06_VULNERABLE_COMPONENTS: 'high',
            A07_AUTH_FAILURES: 'critical',
            A08_SOFTWARE_DATA_INTEGRITY: 'high',
            A09_LOGGING_MONITORING: 'low',
            A10_SSRF: 'high',
        };
        return severityMap[category] || 'medium';
    }

    buildPriorityQueue(hypotheses) {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

        return hypotheses
            .sort((a, b) => {
                // Sort by severity, then confidence
                const sevDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
                if (sevDiff !== 0) return sevDiff;
                return (b.confidence || 0) - (a.confidence || 0);
            })
            .map((h, index) => ({
                priority: index + 1,
                hypothesis_id: `vuln_${index}`,
                endpoint: h.endpoint,
                owasp: h.owasp_category,
                severity: h.severity,
                confidence: h.confidence,
            }));
    }

    buildPrompt(target, endpoints, dataFlowClaims, authClaims, techEvents, patternHypotheses) {
        return `Generate vulnerability hypotheses for this web application:

Target: ${target}

## Endpoints (${endpoints.length} total):
${JSON.stringify(endpoints.slice(0, 40).map(e => ({
            path: e.attributes.path,
            method: e.attributes.method,
            params: e.attributes.params?.slice(0, 5),
        })), null, 2)}

## Data Flow Claims (${dataFlowClaims.length} total):
${JSON.stringify(dataFlowClaims.slice(0, 10).map(c => c.predicate), null, 2)}

## Auth Claims:
${JSON.stringify(authClaims.map(c => c.predicate), null, 2)}

## Technologies Detected:
${[...new Set(techEvents.map(e => e.payload.technology))].join(', ')}

## Initial Pattern Matches (${patternHypotheses.length} total):
${JSON.stringify(patternHypotheses.slice(0, 15), null, 2)}

## Task:
Generate vulnerability hypotheses grounded in OWASP Top 10 2021:
1. Analyze endpoint patterns for access control issues (A01)
2. Check for injection points based on parameters (A03)
3. Evaluate auth mechanisms for weaknesses (A07)
4. Consider SSRF risks from URL parameters (A10)
5. Look for insecure design patterns (A04)

For each hypothesis, provide:
- Specific endpoint affected
- OWASP category
- Concrete evidence from the recon data
- Severity and confidence rating
- Recommended test approach`;
    }

    getOutputSchema() {
        return {
            type: 'object',
            required: ['hypotheses'],
            properties: {
                hypotheses: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['endpoint', 'owasp_category', 'name', 'severity'],
                        properties: {
                            endpoint: { type: 'string' },
                            method: { type: 'string' },
                            owasp_category: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            severity: {
                                type: 'string',
                                enum: ['critical', 'high', 'medium', 'low', 'info'],
                            },
                            confidence: { type: 'number' },
                            supporting_evidence: { type: 'array', items: { type: 'string' } },
                            test_approach: { type: 'string' },
                        },
                    },
                },
            },
        };
    }
}

export default VulnHypothesizer;
