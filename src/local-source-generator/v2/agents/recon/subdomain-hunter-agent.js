/**
 * SubdomainHunterAgent - Subdomain enumeration agent
 * 
 * Discovers subdomains via DNS, certificate transparency, and passive sources.
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, isToolAvailable, getToolTimeout } from '../../tools/runners/tool-runner.js';
import { normalizeSubfinder } from '../../tools/normalizers/evidence-normalizers.js';
import { createEvidenceEvent, EVENT_TYPES } from '../../worldmodel/evidence-graph.js';

export class SubdomainHunterAgent extends BaseAgent {
    constructor(options = {}) {
        super('SubdomainHunterAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target domain' },
                passive_only: { type: 'boolean', description: 'Use only passive sources' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                subdomains: { type: 'array', items: { type: 'string' } },
                sources: { type: 'array', items: { type: 'string' } },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.DNS_RECORD],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 500,
            max_tokens: 0,
            max_tool_invocations: 5,
        };
    }

    async run(ctx, inputs) {
        const { target, passive_only = true } = inputs;
        const domain = this.extractDomain(target);

        const results = {
            subdomains: [],
            sources: [],
        };

        const seenSubdomains = new Set();

        // Run subfinder
        const subfinderAvailable = await isToolAvailable('subfinder');
        if (subfinderAvailable) {
            ctx.recordToolInvocation();

            const flags = passive_only ? '' : '-active';
            const subfinderCmd = `subfinder -d ${domain} -silent ${flags}`;
            const result = await runToolWithRetry(subfinderCmd, {
                timeout: getToolTimeout('subfinder'),
            });

            if (result.success) {
                const events = normalizeSubfinder(result.stdout, domain);
                results.sources.push('subfinder');

                for (const event of events) {
                    const subdomain = event.payload.subdomain;
                    if (!seenSubdomains.has(subdomain)) {
                        seenSubdomains.add(subdomain);
                        ctx.emitEvidence(event);
                        results.subdomains.push(subdomain);
                    }
                }
            } else {
                ctx.emitEvidence(createEvidenceEvent({
                    source: 'SubdomainHunterAgent',
                    event_type: result.timedOut ? EVENT_TYPES.TOOL_TIMEOUT : EVENT_TYPES.TOOL_ERROR,
                    target: domain,
                    payload: { tool: 'subfinder', error: result.error },
                }));
            }
        }

        // Query crt.sh for certificate transparency
        ctx.recordNetworkRequest();
        try {
            const crtshUrl = `https://crt.sh/?q=%25.${domain}&output=json`;
            const response = await fetch(crtshUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 Shannon-LSG/2.0' },
            });

            if (response.ok) {
                const data = await response.json();
                results.sources.push('crt.sh');

                for (const cert of data) {
                    const names = cert.name_value?.split('\n') || [];
                    for (const name of names) {
                        const subdomain = name.trim().replace(/^\*\./, '');
                        if (subdomain.endsWith(domain) && !seenSubdomains.has(subdomain)) {
                            seenSubdomains.add(subdomain);
                            results.subdomains.push(subdomain);

                            ctx.emitEvidence(createEvidenceEvent({
                                source: 'crt.sh',
                                event_type: EVENT_TYPES.TLS_CERT,
                                target: domain,
                                payload: {
                                    subdomain,
                                    issuer: cert.issuer_name,
                                    not_before: cert.not_before,
                                    not_after: cert.not_after,
                                },
                            }));
                        }
                    }
                }
            }
        } catch {
            // Ignore crt.sh errors
        }

        return results;
    }

    extractDomain(target) {
        try {
            const url = new URL(target);
            return url.hostname;
        } catch {
            // Already a domain
            return target.replace(/^www\./, '');
        }
    }
}

export default SubdomainHunterAgent;
