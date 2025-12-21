/**
 * CrawlerAgent - Active crawling agent
 * 
 * Discovers endpoints, parameters, and forms via active crawling.
 * Uses katana and gau for discovery.
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, isToolAvailable, getToolTimeout } from '../../tools/runners/tool-runner.js';
import { normalizeKatana, normalizeGau } from '../../tools/normalizers/evidence-normalizers.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';

export class CrawlerAgent extends BaseAgent {
    constructor(options = {}) {
        super('CrawlerAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
                depth: { type: 'number', description: 'Crawl depth (default: 3)' },
                includeHistorical: { type: 'boolean', description: 'Include historical URLs from gau' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                endpoints: { type: 'array', items: { type: 'object' } },
                forms: { type: 'array', items: { type: 'object' } },
                js_files: { type: 'array', items: { type: 'string' } },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.ENDPOINT_DISCOVERED, EVENT_TYPES.FORM_DISCOVERED, EVENT_TYPES.LINK_DISCOVERED],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 300000,
            max_network_requests: 5000,
            max_tokens: 0,
            max_tool_invocations: 10,
        };
    }

    async run(ctx, inputs) {
        const { target, depth = 3, includeHistorical = true } = inputs;
        const hostname = this.extractHostname(target);

        const results = {
            endpoints: [],
            forms: [],
            js_files: [],
            sources: [],
        };

        const seenPaths = new Set();

        // Run katana for active crawling
        const katanaAvailable = await isToolAvailable('katana');
        if (katanaAvailable) {
            ctx.recordToolInvocation();

            const katanaCmd = `katana -u ${target} -d ${depth} -jc -silent -jsonl`;
            const katanaResult = await runToolWithRetry(katanaCmd, {
                timeout: getToolTimeout('katana'),
            });

            if (katanaResult.success) {
                const events = normalizeKatana(katanaResult.stdout, target);
                results.sources.push('katana');

                for (const event of events) {
                    const path = event.payload.path;

                    if (!seenPaths.has(path)) {
                        seenPaths.add(path);
                        ctx.emitEvidence(event);

                        if (event.event_type === EVENT_TYPES.ENDPOINT_DISCOVERED) {
                            results.endpoints.push(event.payload);

                            // Track JS files
                            if (path.endsWith('.js')) {
                                results.js_files.push(event.payload.url);
                            }
                        }

                        if (event.event_type === EVENT_TYPES.FORM_DISCOVERED) {
                            results.forms.push(event.payload);
                        }
                    }
                }
            } else {
                ctx.emitEvidence(createEvidenceEvent({
                    source: 'CrawlerAgent',
                    event_type: katanaResult.timedOut ? EVENT_TYPES.TOOL_TIMEOUT : EVENT_TYPES.TOOL_ERROR,
                    target,
                    payload: { tool: 'katana', error: katanaResult.error },
                }));
            }
        }

        // Run gau for historical URLs
        if (includeHistorical) {
            const gauAvailable = await isToolAvailable('gau');
            if (gauAvailable) {
                ctx.recordToolInvocation();

                const gauCmd = `gau --subs ${hostname}`;
                const gauResult = await runToolWithRetry(gauCmd, {
                    timeout: getToolTimeout('gau'),
                });

                if (gauResult.success) {
                    const events = normalizeGau(gauResult.stdout, target);
                    results.sources.push('gau');

                    for (const event of events) {
                        const path = event.payload.path;

                        if (!seenPaths.has(path)) {
                            seenPaths.add(path);
                            ctx.emitEvidence(event);
                            results.endpoints.push(event.payload);

                            if (path.endsWith('.js')) {
                                results.js_files.push(event.payload.url);
                            }
                        }
                    }
                }
            }
        }

        // Emit light claim for endpoint count
        if (results.endpoints.length > 0) {
            ctx.emitClaim({
                claim_type: 'discovery_summary',
                subject: target,
                predicate: {
                    endpoint_count: results.endpoints.length,
                    form_count: results.forms.length,
                    js_file_count: results.js_files.length,
                },
                base_rate: 0.9, // High confidence in discovery
            });
        }

        return results;
    }

    extractHostname(target) {
        try {
            const url = new URL(target);
            return url.hostname;
        } catch {
            return target;
        }
    }
}

export default CrawlerAgent;
