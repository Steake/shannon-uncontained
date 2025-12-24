/**
 * SecurityHeaderAnalyzer - Security header compliance checking
 * 
 * Analyzes HTTP response headers for security best practices
 * and generates defensive recommendations.
 */

import { BaseAgent } from '../base-agent.js';

export class SecurityHeaderAnalyzer extends BaseAgent {
    constructor(options = {}) {
        super('SecurityHeaderAnalyzer', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL to analyze' },
                groundTruthPath: {
                    type: 'string',
                    description: 'Path to ground_truth_validation.json'
                }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                analysis: { type: 'object' },
                missingHeaders: { type: 'array' },
                recommendations: { type: 'array' },
                score: { type: 'number' }
            }
        };

        this.requires = {
            evidence_kinds: ['ground_truth_probed', 'http_response'],
            model_nodes: ['endpoints']
        };

        this.emits = {
            evidence_events: ['security_header_missing', 'header_misconfiguration'],
            model_updates: ['security_posture'],
            claims: ['missing_security_header', 'weak_security_config'],
            artifacts: ['security_header_report.json']
        };

        this.default_budget = {
            max_time_ms: 30000,
            max_network_requests: 5,
            max_tokens: 0,
            max_tool_invocations: 0
        };

        // Required security headers with severity and description
        this.requiredHeaders = {
            'strict-transport-security': {
                severity: 'high',
                description: 'Enforces HTTPS connections',
                recommendation: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
                weight: 1.0
            },
            'content-security-policy': {
                severity: 'high',
                description: 'Prevents XSS and data injection attacks',
                recommendation: "Add: Content-Security-Policy: default-src 'self'; script-src 'self'",
                weight: 1.0
            },
            'x-content-type-options': {
                severity: 'medium',
                description: 'Prevents MIME-type sniffing',
                recommendation: 'Add: X-Content-Type-Options: nosniff',
                weight: 0.7
            },
            'x-frame-options': {
                severity: 'medium',
                description: 'Prevents clickjacking attacks',
                recommendation: 'Add: X-Frame-Options: DENY or SAMEORIGIN',
                weight: 0.7
            },
            'x-xss-protection': {
                severity: 'low',
                description: 'Legacy XSS protection (deprecated but still useful)',
                recommendation: 'Add: X-XSS-Protection: 1; mode=block',
                weight: 0.3
            },
            'referrer-policy': {
                severity: 'medium',
                description: 'Controls referrer information leakage',
                recommendation: 'Add: Referrer-Policy: strict-origin-when-cross-origin',
                weight: 0.6
            },
            'permissions-policy': {
                severity: 'medium',
                description: 'Controls browser feature access',
                recommendation: 'Add: Permissions-Policy: geolocation=(), camera=(), microphone=()',
                weight: 0.5
            },
            'cache-control': {
                severity: 'low',
                description: 'Controls caching behavior for sensitive pages',
                recommendation: 'Add: Cache-Control: no-store, no-cache, must-revalidate',
                weight: 0.4
            }
        };

        // Dangerous headers that should NOT be present
        this.dangerousHeaders = {
            'server': {
                severity: 'low',
                description: 'Reveals server software version',
                recommendation: 'Remove or obfuscate Server header'
            },
            'x-powered-by': {
                severity: 'low',
                description: 'Reveals technology stack',
                recommendation: 'Remove X-Powered-By header'
            },
            'x-aspnet-version': {
                severity: 'medium',
                description: 'Reveals ASP.NET version',
                recommendation: 'Remove X-AspNet-Version header'
            }
        };
    }

    /**
     * Fetch headers from target
     */
    async fetchHeaders(target) {
        try {
            const response = await fetch(target, {
                method: 'HEAD',
                redirect: 'follow'
            });

            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
            });

            return { success: true, headers, status: response.status };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Analyze CSP policy quality
     */
    analyzeCSP(cspValue) {
        const issues = [];

        if (cspValue.includes("'unsafe-inline'")) {
            issues.push({ issue: "unsafe-inline allows inline scripts", severity: 'high' });
        }
        if (cspValue.includes("'unsafe-eval'")) {
            issues.push({ issue: "unsafe-eval allows eval()", severity: 'high' });
        }
        if (cspValue.includes('*')) {
            issues.push({ issue: "Wildcard source allows any origin", severity: 'medium' });
        }
        if (!cspValue.includes('default-src')) {
            issues.push({ issue: "Missing default-src directive", severity: 'medium' });
        }

        return issues;
    }

    /**
     * Analyze HSTS policy quality
     */
    analyzeHSTS(hstsValue) {
        const issues = [];

        const maxAgeMatch = hstsValue.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
            const maxAge = parseInt(maxAgeMatch[1]);
            if (maxAge < 31536000) { // Less than 1 year
                issues.push({ issue: `max-age too short (${maxAge}s), should be at least 1 year`, severity: 'medium' });
            }
        }

        if (!hstsValue.includes('includeSubDomains')) {
            issues.push({ issue: "Missing includeSubDomains directive", severity: 'low' });
        }

        return issues;
    }

    /**
     * Calculate security score (0-100)
     */
    calculateScore(presentHeaders, missingHeaders, issues) {
        let score = 100;

        // Deduct for missing headers
        for (const header of missingHeaders) {
            const config = this.requiredHeaders[header.toLowerCase()];
            if (config) {
                const deduction = config.weight * 10;
                score -= deduction;
            }
        }

        // Deduct for issues
        for (const issue of issues) {
            if (issue.severity === 'high') score -= 10;
            else if (issue.severity === 'medium') score -= 5;
            else score -= 2;
        }

        // Bonus for extra security headers
        const bonusHeaders = ['expect-ct', 'cross-origin-embedder-policy', 'cross-origin-opener-policy'];
        for (const header of bonusHeaders) {
            if (presentHeaders[header]) {
                score += 2;
            }
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        const { target } = inputs;

        // Fetch headers
        ctx.recordNetworkRequest();
        const result = await this.fetchHeaders(target);

        if (!result.success) {
            return {
                error: result.error,
                analysis: {},
                missingHeaders: [],
                recommendations: [],
                score: 0
            };
        }

        const headers = result.headers;
        const analysis = {
            present: {},
            missing: [],
            dangerous: [],
            issues: []
        };

        // Check required headers
        for (const [header, config] of Object.entries(this.requiredHeaders)) {
            if (headers[header]) {
                analysis.present[header] = {
                    value: headers[header],
                    severity: config.severity
                };

                // Deep analyze specific headers
                if (header === 'content-security-policy') {
                    const cspIssues = this.analyzeCSP(headers[header]);
                    analysis.issues.push(...cspIssues);
                }
                if (header === 'strict-transport-security') {
                    const hstsIssues = this.analyzeHSTS(headers[header]);
                    analysis.issues.push(...hstsIssues);
                }
            } else {
                analysis.missing.push({
                    header,
                    severity: config.severity,
                    description: config.description,
                    recommendation: config.recommendation
                });
            }
        }

        // Check dangerous headers
        for (const [header, config] of Object.entries(this.dangerousHeaders)) {
            if (headers[header]) {
                analysis.dangerous.push({
                    header,
                    value: headers[header],
                    severity: config.severity,
                    recommendation: config.recommendation
                });
            }
        }

        // Calculate score
        const score = this.calculateScore(headers, analysis.missing.map(m => m.header), analysis.issues);

        // Build recommendations
        const recommendations = [
            ...analysis.missing.map(m => ({
                priority: m.severity,
                action: m.recommendation,
                reason: m.description
            })),
            ...analysis.dangerous.map(d => ({
                priority: d.severity,
                action: d.recommendation,
                reason: `${d.header} header reveals: ${d.value}`
            })),
            ...analysis.issues.map(i => ({
                priority: i.severity,
                action: `Fix: ${i.issue}`,
                reason: i.issue
            }))
        ];

        // Emit evidence for missing headers
        for (const missing of analysis.missing) {
            const evidenceId = ctx.emitEvidence({
                type: 'security_header_missing',
                source: this.name,
                data: missing
            });

            ctx.emitClaim({
                claim_type: 'missing_security_header',
                subject: target,
                predicate: {
                    header: missing.header,
                    severity: missing.severity
                },
                base_rate: 0.5  // Security header issues are common
            });

            ctx.ledger.addEvidence(
                ctx.ledger.generateClaimId('missing_security_header', target),
                'active_probe_success',
                0.8,
                this.name,
                evidenceId
            );
        }

        return {
            analysis,
            missingHeaders: analysis.missing,
            dangerousHeaders: analysis.dangerous,
            issues: analysis.issues,
            recommendations,
            score,
            grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
        };
    }
}

export default SecurityHeaderAnalyzer;
