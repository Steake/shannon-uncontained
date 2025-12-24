/**
 * TechFingerprinterAgent - Technology fingerprinting agent
 * 
 * Detects frameworks, CMS, WAF, CDN from headers and response patterns.
 * Emits both evidence events and light claims.
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, isToolAvailable, getToolTimeout } from '../../tools/runners/tool-runner.js';
import { normalizeWhatweb, normalizeHttpx } from '../../tools/normalizers/evidence-normalizers.js';
import { createEvidenceEvent } from '../../worldmodel/evidence-graph.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class TechFingerprinterAgent extends BaseAgent {
    constructor(options = {}) {
        super('TechFingerprinterAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                technologies: { type: 'array', items: { type: 'object' } },
                framework: { type: 'string' },
                server: { type: 'string' },
                waf: { type: 'string' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: ['tech_detection', 'http_response'],
            model_updates: [],
            claims: [CLAIM_TYPES.FRAMEWORK],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 60000,
            max_network_requests: 20,
            max_tokens: 0,
            max_tool_invocations: 5,
        };
    }

    async run(ctx, inputs) {
        const { target } = inputs;

        const results = {
            technologies: [],
            framework: null,
            server: null,
            waf: null,
            cms: null,
        };

        const techCounts = new Map(); // For evidence fusion

        // Run whatweb
        const whatwebAvailable = await isToolAvailable('whatweb');
        if (whatwebAvailable) {
            ctx.recordToolInvocation();

            const whatwebCmd = `whatweb -a 3 --log-json=- ${target}`;
            const result = await runToolWithRetry(whatwebCmd, {
                timeout: getToolTimeout('whatweb'),
            });

            if (result.success) {
                const events = normalizeWhatweb(result.stdout, target);

                for (const event of events) {
                    ctx.emitEvidence(event);

                    const tech = event.payload.technology;
                    techCounts.set(tech, (techCounts.get(tech) || 0) + 1);

                    results.technologies.push({
                        name: tech,
                        version: event.payload.version,
                        source: 'whatweb',
                    });

                    // Categorize
                    this.categorizeTech(tech, results);
                }
            }
        }

        // Run httpx for additional detection
        const httpxAvailable = await isToolAvailable('httpx');
        if (httpxAvailable) {
            ctx.recordToolInvocation();

            const httpxCmd = `echo "${target}" | httpx -silent -json -tech-detect`;
            const result = await runToolWithRetry(httpxCmd, {
                timeout: getToolTimeout('httpx'),
            });

            if (result.success) {
                const events = normalizeHttpx(result.stdout, target);

                for (const event of events) {
                    ctx.emitEvidence(event);

                    if (event.payload.technologies) {
                        for (const tech of event.payload.technologies) {
                            techCounts.set(tech, (techCounts.get(tech) || 0) + 1);

                            if (!results.technologies.find(t => t.name === tech)) {
                                results.technologies.push({ name: tech, source: 'httpx' });
                                this.categorizeTech(tech, results);
                            }
                        }
                    }

                    if (event.payload.server) {
                        results.server = event.payload.server;
                    }
                }
            }
        }

        // Emit claims for detected frameworks
        if (results.framework) {
            const evidence = techCounts.get(results.framework) || 1;
            ctx.emitClaim({
                claim_type: CLAIM_TYPES.FRAMEWORK,
                subject: target,
                predicate: { framework: results.framework },
                base_rate: 0.3, // Conservative base rate
            });

            // Add evidence to claim
            const claim = ctx.ledger.getClaim(
                ctx.ledger.constructor.generateClaimId(CLAIM_TYPES.FRAMEWORK, target, { framework: results.framework })
            );
            if (claim) {
                claim.addEvidence('crawl_observed', evidence);
                if (results.technologies.length > 1) {
                    claim.addEvidence('js_ast_heuristic', 1);
                }
            }
        }

        return results;
    }

    categorizeTech(tech, results) {
        const techLower = tech.toLowerCase();

        // Frameworks
        const frameworks = ['express', 'django', 'rails', 'laravel', 'spring', 'flask', 'fastapi', 'nextjs', 'nuxt', 'angular', 'react', 'vue'];
        for (const fw of frameworks) {
            if (techLower.includes(fw)) {
                results.framework = tech;
                return;
            }
        }

        // CMS
        const cms = ['wordpress', 'drupal', 'joomla', 'magento', 'shopify', 'wix', 'squarespace'];
        for (const c of cms) {
            if (techLower.includes(c)) {
                results.cms = tech;
                return;
            }
        }

        // WAF
        const wafs = ['cloudflare', 'akamai', 'incapsula', 'sucuri', 'f5', 'imperva', 'barracuda'];
        for (const w of wafs) {
            if (techLower.includes(w)) {
                results.waf = tech;
                return;
            }
        }
    }
}

export default TechFingerprinterAgent;
