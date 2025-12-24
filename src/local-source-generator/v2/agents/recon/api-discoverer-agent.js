/**
 * APIDiscovererAgent - API schema discovery agent
 * 
 * Discovers OpenAPI/Swagger specs, GraphQL schemas, and infers API structure.
 */

import { BaseAgent } from '../base-agent.js';
import { createEvidenceEvent, EVENT_TYPES } from '../../worldmodel/evidence-graph.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class APIDiscovererAgent extends BaseAgent {
    constructor(options = {}) {
        super('APIDiscovererAgent', options);

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
                openapi_spec: { type: 'object' },
                graphql_schema: { type: 'object' },
                api_type: { type: 'string' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.OPENAPI_FRAGMENT, EVENT_TYPES.GRAPHQL_SCHEMA],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 60000,
            max_network_requests: 50,
            max_tokens: 0,
            max_tool_invocations: 5,
        };

        // Common OpenAPI/Swagger paths
        this.openApiPaths = [
            '/openapi.json',
            '/openapi.yaml',
            '/swagger.json',
            '/swagger.yaml',
            '/api-docs',
            '/api/docs',
            '/docs/api',
            '/v1/openapi.json',
            '/v2/openapi.json',
            '/api/v1/openapi.json',
            '/api/openapi.json',
            '/swagger/v1/swagger.json',
            '/.well-known/openapi.json',
        ];

        // Common GraphQL endpoints
        this.graphqlPaths = [
            '/graphql',
            '/graphql/',
            '/api/graphql',
            '/v1/graphql',
            '/gql',
        ];
    }

    async run(ctx, inputs) {
        const { target } = inputs;
        const baseUrl = new URL(target).origin;

        const results = {
            openapi_spec: null,
            graphql_schema: null,
            api_type: 'unknown',
            discovered_paths: [],
        };

        // Try OpenAPI/Swagger endpoints
        for (const path of this.openApiPaths) {
            ctx.recordNetworkRequest();

            try {
                const url = `${baseUrl}${path}`;
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/json, application/yaml',
                        'User-Agent': 'Mozilla/5.0 Shannon-LSG/2.0',
                    },
                });

                if (response.ok) {
                    const contentType = response.headers.get('content-type') || '';
                    const text = await response.text();

                    // Try to parse as JSON
                    try {
                        const spec = JSON.parse(text);

                        // Validate it looks like OpenAPI
                        if (spec.openapi || spec.swagger || spec.paths) {
                            results.openapi_spec = spec;
                            results.api_type = 'rest';
                            results.discovered_paths.push(path);

                            // Store as blob
                            const blobRef = ctx.evidenceGraph.storeBlob(text, 'application/json');

                            ctx.emitEvidence(createEvidenceEvent({
                                source: 'APIDiscovererAgent',
                                event_type: EVENT_TYPES.OPENAPI_FRAGMENT,
                                target,
                                payload: {
                                    path,
                                    version: spec.openapi || spec.swagger,
                                    title: spec.info?.title,
                                    endpoint_count: spec.paths ? Object.keys(spec.paths).length : 0,
                                },
                                blob_refs: [blobRef],
                            }));

                            // Extract endpoints from spec
                            if (spec.paths) {
                                for (const [endpoint, methods] of Object.entries(spec.paths)) {
                                    for (const method of Object.keys(methods)) {
                                        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                                            ctx.emitClaim({
                                                claim_type: CLAIM_TYPES.ENDPOINT_EXISTS,
                                                subject: endpoint,
                                                predicate: { method: method.toUpperCase(), path: endpoint },
                                                base_rate: 0.5,
                                            });

                                            // Add strong evidence from OpenAPI
                                            const claim = ctx.ledger.getClaim(
                                                ctx.ledger.constructor.generateClaimId(
                                                    CLAIM_TYPES.ENDPOINT_EXISTS,
                                                    endpoint,
                                                    { method: method.toUpperCase(), path: endpoint }
                                                )
                                            );
                                            if (claim) {
                                                claim.addEvidence('openapi_fragment', 2); // Strong evidence
                                            }
                                        }
                                    }
                                }
                            }

                            break; // Found spec, stop searching
                        }
                    } catch {
                        // Not valid JSON, try YAML later if needed
                    }
                }
            } catch {
                // Ignore fetch errors
            }
        }

        // Try GraphQL endpoints
        for (const path of this.graphqlPaths) {
            ctx.recordNetworkRequest();

            try {
                const url = `${baseUrl}${path}`;

                // Send introspection query
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 Shannon-LSG/2.0',
                    },
                    body: JSON.stringify({
                        query: this.getIntrospectionQuery(),
                    }),
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.data?.__schema) {
                        results.graphql_schema = data.data.__schema;
                        results.api_type = results.api_type === 'rest' ? 'hybrid' : 'graphql';
                        results.discovered_paths.push(path);

                        // Store as blob
                        const blobRef = ctx.evidenceGraph.storeBlob(
                            JSON.stringify(data.data.__schema),
                            'application/json'
                        );

                        ctx.emitEvidence(createEvidenceEvent({
                            source: 'APIDiscovererAgent',
                            event_type: EVENT_TYPES.GRAPHQL_SCHEMA,
                            target,
                            payload: {
                                path,
                                types_count: data.data.__schema.types?.length || 0,
                                query_type: data.data.__schema.queryType?.name,
                                mutation_type: data.data.__schema.mutationType?.name,
                            },
                            blob_refs: [blobRef],
                        }));

                        break; // Found schema, stop searching
                    }
                }
            } catch {
                // Ignore fetch errors
            }
        }

        return results;
    }

    getIntrospectionQuery() {
        return `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            kind
            name
            description
            fields(includeDeprecated: true) {
              name
              description
              args {
                name
                type { name kind }
              }
              type { name kind }
            }
          }
        }
      }
    `;
    }
}

export default APIDiscovererAgent;
