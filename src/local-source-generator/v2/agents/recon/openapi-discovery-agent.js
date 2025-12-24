/**
 * OpenAPIDiscoveryAgent - Automated OpenAPI/Swagger spec detection
 * 
 * Probes common API documentation paths and parses specs to discover endpoints.
 * This bypasses WAF/bot protection since API docs are usually public.
 */

import { BaseAgent } from '../base-agent.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';
import fetch from 'node-fetch';

// Common OpenAPI/Swagger paths to probe
const OPENAPI_PATHS = [
    '/openapi.json',
    '/openapi.yaml',
    '/swagger.json',
    '/swagger.yaml',
    '/api-docs',
    '/api-docs.json',
    '/v1/openapi.json',
    '/v2/openapi.json',
    '/v3/openapi.json',
    '/api/openapi.json',
    '/api/swagger.json',
    '/docs/openapi.json',
    '/docs/swagger.json',
    '/.well-known/openapi.json',
    '/api/v1/docs',
    '/api/v2/docs',
    '/redoc',
    '/graphql', // GraphQL introspection
];

export class OpenAPIDiscoveryAgent extends BaseAgent {
    constructor(options = {}) {
        super('OpenAPIDiscoveryAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
                customPaths: { type: 'array', items: { type: 'string' } },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                specs_found: { type: 'array' },
                endpoints_discovered: { type: 'number' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.ENDPOINT_DISCOVERED, 'openapi_fragment'],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 60000,
            max_network_requests: 50,
            max_tokens: 0,
            max_tool_invocations: 0,
        };
    }

    async run(ctx, inputs) {
        const { target, customPaths = [] } = inputs;
        const baseUrl = this.normalizeBaseUrl(target);
        const pathsToCheck = [...OPENAPI_PATHS, ...customPaths];

        const results = {
            specs_found: [],
            endpoints_discovered: 0,
        };

        this.setStatus(`Probing ${pathsToCheck.length} API doc paths...`);

        for (const path of pathsToCheck) {
            const url = `${baseUrl}${path}`;

            try {
                ctx.recordNetworkRequest();
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json, application/yaml, text/yaml, */*',
                        'User-Agent': 'Mozilla/5.0 (compatible; SecurityScanner/1.0)',
                    },
                    timeout: 10000,
                });

                if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    const text = await response.text();

                    // Try to parse as OpenAPI/Swagger
                    const spec = await this.parseSpec(text, contentType, url);

                    if (spec) {
                        results.specs_found.push({ url, type: spec.type });

                        // Emit evidence for the spec
                        ctx.emitEvidence({
                            source: this.name,
                            event_type: 'openapi_fragment',
                            target,
                            payload: {
                                url,
                                spec_type: spec.type,
                                version: spec.version,
                                paths: spec.paths,
                            },
                        });

                        // Extract endpoints from spec
                        const endpoints = this.extractEndpoints(spec, baseUrl);
                        for (const ep of endpoints) {
                            ctx.emitEvidence({
                                source: this.name,
                                event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                                target,
                                payload: ep,
                            });
                            results.endpoints_discovered++;
                        }

                        this.setStatus(`Found ${spec.type} at ${path} (${endpoints.length} endpoints)`);
                    }
                }
            } catch (e) {
                // Silently skip failed probes
            }
        }

        // Try GraphQL introspection
        await this.probeGraphQL(ctx, baseUrl, results);

        this.setStatus(`Discovered ${results.endpoints_discovered} endpoints from ${results.specs_found.length} specs`);
        return results;
    }

    normalizeBaseUrl(target) {
        try {
            const url = new URL(target);
            return `${url.protocol}//${url.host}`;
        } catch {
            return target.replace(/\/$/, '');
        }
    }

    async parseSpec(text, contentType, url) {
        try {
            let data;

            // Try JSON first
            if (contentType.includes('json') || text.trim().startsWith('{')) {
                data = JSON.parse(text);
            } else if (contentType.includes('yaml') || text.trim().startsWith('openapi:') || text.trim().startsWith('swagger:')) {
                // Basic YAML detection - would need yaml parser for full support
                return null; // Skip YAML for now
            } else {
                return null;
            }

            // Detect spec type
            if (data.openapi) {
                return {
                    type: 'OpenAPI',
                    version: data.openapi,
                    paths: data.paths || {},
                    info: data.info,
                };
            } else if (data.swagger) {
                return {
                    type: 'Swagger',
                    version: data.swagger,
                    paths: data.paths || {},
                    info: data.info,
                };
            } else if (data.__schema || data.data?.__schema) {
                // GraphQL introspection result
                return {
                    type: 'GraphQL',
                    version: '1.0',
                    schema: data.__schema || data.data.__schema,
                    paths: {},
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    extractEndpoints(spec, baseUrl) {
        const endpoints = [];

        if (spec.paths) {
            for (const [path, methods] of Object.entries(spec.paths)) {
                for (const [method, operation] of Object.entries(methods)) {
                    if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
                        endpoints.push({
                            method: method.toUpperCase(),
                            path,
                            url: `${baseUrl}${path}`,
                            source: 'openapi',
                            operationId: operation.operationId,
                            summary: operation.summary,
                            params: this.extractParams(operation),
                        });
                    }
                }
            }
        }

        return endpoints;
    }

    extractParams(operation) {
        const params = [];

        if (operation.parameters) {
            for (const param of operation.parameters) {
                params.push({
                    name: param.name,
                    location: param.in, // query, path, header, cookie
                    type: param.schema?.type || 'string',
                    required: param.required || false,
                });
            }
        }

        // Extract body params from requestBody
        if (operation.requestBody?.content) {
            const content = operation.requestBody.content;
            const jsonSchema = content['application/json']?.schema;
            if (jsonSchema?.properties) {
                for (const [name, prop] of Object.entries(jsonSchema.properties)) {
                    params.push({
                        name,
                        location: 'body',
                        type: prop.type || 'string',
                        required: jsonSchema.required?.includes(name) || false,
                    });
                }
            }
        }

        return params;
    }

    async probeGraphQL(ctx, baseUrl, results) {
        const graphqlEndpoints = ['/graphql', '/api/graphql', '/v1/graphql'];
        const introspectionQuery = JSON.stringify({
            query: `{ __schema { types { name } } }`
        });

        for (const path of graphqlEndpoints) {
            try {
                ctx.recordNetworkRequest();
                const response = await fetch(`${baseUrl}${path}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: introspectionQuery,
                    timeout: 10000,
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.data?.__schema) {
                        results.specs_found.push({ url: `${baseUrl}${path}`, type: 'GraphQL' });

                        ctx.emitEvidence({
                            source: this.name,
                            event_type: 'graphql_schema',
                            target: baseUrl,
                            payload: {
                                url: `${baseUrl}${path}`,
                                schema: data.data.__schema,
                            },
                        });

                        // Emit GraphQL endpoint
                        ctx.emitEvidence({
                            source: this.name,
                            event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                            target: baseUrl,
                            payload: {
                                method: 'POST',
                                path,
                                url: `${baseUrl}${path}`,
                                source: 'graphql',
                            },
                        });
                        results.endpoints_discovered++;
                    }
                }
            } catch {
                // Skip failed probes
            }
        }
    }
}

export default OpenAPIDiscoveryAgent;
