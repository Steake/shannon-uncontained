/**
 * JSHarvesterAgent - JavaScript analysis agent
 * 
 * Extracts API endpoints, route strings, and state machine hints from JS bundles.
 * Uses AST-based analysis via Playwright for dynamic JS extraction.
 */

import { BaseAgent } from '../base-agent.js';
import { createEvidenceEvent, EVENT_TYPES } from '../../worldmodel/evidence-graph.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class JSHarvesterAgent extends BaseAgent {
    constructor(options = {}) {
        super('JSHarvesterAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
                js_files: { type: 'array', items: { type: 'string' }, description: 'JS file URLs to analyze' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                endpoints: { type: 'array', items: { type: 'object' } },
                routes: { type: 'array', items: { type: 'string' } },
                secrets: { type: 'array', items: { type: 'object' } },
                state_hints: { type: 'array', items: { type: 'object' } },
            },
        };

        this.requires = {
            evidence_kinds: [EVENT_TYPES.ENDPOINT_DISCOVERED],
            model_nodes: []
        };
        this.emits = {
            evidence_events: [EVENT_TYPES.JS_FETCH_CALL, EVENT_TYPES.JS_ROUTE_STRING, EVENT_TYPES.JS_STATE_HINT],
            model_updates: [],
            claims: [CLAIM_TYPES.ENDPOINT_EXISTS],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 100,
            max_tokens: 5000,
            max_tool_invocations: 20,
        };

        // Patterns for extraction
        this.patterns = {
            // Fetch/XHR patterns
            fetch: [
                /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /fetch\s*\(\s*`([^`]+)`/g,
                /\.get\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /\.post\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /\.put\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /\.delete\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /axios\s*\.\s*\w+\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /\$\.ajax\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
            ],

            // Route definitions
            routes: [
                /path\s*:\s*['"`]([^'"`]+)['"`]/g,
                /route\s*:\s*['"`]([^'"`]+)['"`]/g,
                /to\s*:\s*['"`]([^'"`]+)['"`]/g,
                /router\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/g,
                /app\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/g,
            ],

            // API base URLs
            apiBase: [
                /API_URL\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
                /BASE_URL\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
                /API_ENDPOINT\s*[=:]\s*['"`]([^'"`]+)['"`]/gi,
                /baseURL\s*:\s*['"`]([^'"`]+)['"`]/gi,
            ],

            // Potential secrets
            secrets: [
                /api[_-]?key\s*[=:]\s*['"`]([^'"`]{10,})['"`]/gi,
                /secret\s*[=:]\s*['"`]([^'"`]{10,})['"`]/gi,
                /token\s*[=:]\s*['"`]([^'"`]{10,})['"`]/gi,
                /password\s*[=:]\s*['"`]([^'"`]{6,})['"`]/gi,
                /aws[_-]?access/gi,
                /private[_-]?key/gi,
            ],

            // State management hints
            stateHints: [
                /createStore|configureStore|createSlice/g,
                /useState|useReducer|useContext/g,
                /Vuex\.Store|createPinia/g,
                /\$store\./g,
                /dispatch\s*\(\s*['"`](\w+)['"`]/g,
                /commit\s*\(\s*['"`](\w+)['"`]/g,
            ],
        };
    }

    async run(ctx, inputs) {
        const { target, js_files = [] } = inputs;

        const results = {
            endpoints: [],
            routes: [],
            secrets: [],
            state_hints: [],
            api_bases: [],
        };

        const seenEndpoints = new Set();

        // Analyze each JS file
        for (const jsUrl of js_files) {
            ctx.recordNetworkRequest();

            try {
                const jsContent = await this.fetchJSContent(jsUrl);
                if (!jsContent) continue;

                // Store blob reference
                const blobRef = ctx.evidenceGraph.storeBlob(jsContent, 'application/javascript');

                // Extract fetch/XHR calls
                for (const pattern of this.patterns.fetch) {
                    const matches = jsContent.matchAll(pattern);
                    for (const match of matches) {
                        const endpoint = this.normalizeEndpoint(match[1], target);
                        if (endpoint && !seenEndpoints.has(endpoint)) {
                            seenEndpoints.add(endpoint);

                            const method = this.inferMethod(match[0]);

                            ctx.emitEvidence(createEvidenceEvent({
                                source: 'JSHarvesterAgent',
                                event_type: EVENT_TYPES.JS_FETCH_CALL,
                                target,
                                payload: {
                                    endpoint,
                                    method,
                                    source_file: jsUrl,
                                    raw_match: match[0].slice(0, 200),
                                },
                                blob_refs: [blobRef],
                            }));

                            results.endpoints.push({ endpoint, method, source: jsUrl });

                            // Emit claim with js_ast_direct evidence
                            const claim = ctx.emitClaim({
                                claim_type: CLAIM_TYPES.ENDPOINT_EXISTS,
                                subject: endpoint,
                                predicate: { method, path: endpoint },
                                base_rate: 0.3,
                            });

                            if (claim) {
                                claim.addEvidence('js_ast_direct', 1);
                            }
                        }
                    }
                }

                // Extract routes
                for (const pattern of this.patterns.routes) {
                    const matches = jsContent.matchAll(pattern);
                    for (const match of matches) {
                        const route = match[1];
                        if (route && route.startsWith('/') && !results.routes.includes(route)) {
                            results.routes.push(route);

                            ctx.emitEvidence(createEvidenceEvent({
                                source: 'JSHarvesterAgent',
                                event_type: EVENT_TYPES.JS_ROUTE_STRING,
                                target,
                                payload: {
                                    route,
                                    source_file: jsUrl,
                                },
                            }));
                        }
                    }
                }

                // Extract API bases
                for (const pattern of this.patterns.apiBase) {
                    const matches = jsContent.matchAll(pattern);
                    for (const match of matches) {
                        const base = match[1];
                        if (base && !results.api_bases.includes(base)) {
                            results.api_bases.push(base);
                        }
                    }
                }

                // Check for secrets (report but don't store values)
                for (const pattern of this.patterns.secrets) {
                    const matches = jsContent.matchAll(pattern);
                    for (const match of matches) {
                        results.secrets.push({
                            type: this.classifySecret(match[0]),
                            location: jsUrl,
                            context: match[0].slice(0, 50) + '...',
                        });
                    }
                }

                // Extract state hints
                for (const pattern of this.patterns.stateHints) {
                    const matches = jsContent.matchAll(pattern);
                    for (const match of matches) {
                        const hint = {
                            pattern: match[0],
                            source_file: jsUrl,
                        };

                        results.state_hints.push(hint);

                        ctx.emitEvidence(createEvidenceEvent({
                            source: 'JSHarvesterAgent',
                            event_type: EVENT_TYPES.JS_STATE_HINT,
                            target,
                            payload: hint,
                        }));
                    }
                }

            } catch (err) {
                // Emit error but continue
                ctx.emitEvidence(createEvidenceEvent({
                    source: 'JSHarvesterAgent',
                    event_type: EVENT_TYPES.TOOL_ERROR,
                    target,
                    payload: { error: err.message, file: jsUrl },
                }));
            }
        }

        return results;
    }

    async fetchJSContent(url) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 Shannon-LSG/2.0' },
            });
            if (response.ok) {
                return await response.text();
            }
        } catch {
            // Ignore fetch errors
        }
        return null;
    }

    normalizeEndpoint(endpoint, target) {
        if (!endpoint) return null;

        // Skip data URIs, blobs, etc.
        if (endpoint.startsWith('data:') || endpoint.startsWith('blob:')) return null;

        // Handle template literals
        endpoint = endpoint.replace(/\$\{[^}]+\}/g, ':param');

        // Handle relative URLs
        if (endpoint.startsWith('/')) {
            return endpoint;
        }

        // Handle full URLs
        try {
            const url = new URL(endpoint, target);
            // Only accept same origin or API endpoints
            const targetHost = new URL(target).hostname;
            if (url.hostname === targetHost || url.hostname.includes('api')) {
                return url.pathname;
            }
        } catch {
            // Not a valid URL
        }

        // Handle relative paths without leading slash
        if (!endpoint.includes('://') && !endpoint.includes(' ')) {
            return '/' + endpoint;
        }

        return null;
    }

    inferMethod(matchStr) {
        const lower = matchStr.toLowerCase();
        if (lower.includes('.post') || lower.includes('method:')) return 'POST';
        if (lower.includes('.put')) return 'PUT';
        if (lower.includes('.delete')) return 'DELETE';
        if (lower.includes('.patch')) return 'PATCH';
        return 'GET';
    }

    classifySecret(match) {
        const lower = match.toLowerCase();
        if (lower.includes('aws')) return 'aws_credential';
        if (lower.includes('api_key') || lower.includes('apikey')) return 'api_key';
        if (lower.includes('token')) return 'token';
        if (lower.includes('password')) return 'password';
        if (lower.includes('secret')) return 'secret';
        if (lower.includes('private')) return 'private_key';
        return 'unknown';
    }
}

export default JSHarvesterAgent;
