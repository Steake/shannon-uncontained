/**
 * SchemaGenAgent - API schema generation agent
 * 
 * Generates OpenAPI and GraphQL schemas from TargetModel.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { createEpistemicEnvelope } from '../../worldmodel/artifact-manifest.js';

export class SchemaGenAgent extends BaseAgent {
    constructor(options = {}) {
        super('SchemaGenAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target', 'outputDir'],
            properties: {
                target: { type: 'string' },
                outputDir: { type: 'string' },
                format: { type: 'string', enum: ['openapi', 'graphql', 'both'] },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                openapi_path: { type: 'string' },
                graphql_path: { type: 'string' },
            },
        };

        this.requires = {
            evidence_kinds: ['openapi_fragment', 'graphql_schema'],
            model_nodes: ['endpoint'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: [],
            claims: [],
            artifacts: ['openapi_spec', 'graphql_schema'],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 5,
            max_tokens: 15000,
            max_tool_invocations: 10,
        };

        this.llm = getLLMClient();
    }

    async run(ctx, inputs) {
        const { target, outputDir, format = 'openapi' } = inputs;
        const { fs, path } = await import('zx');

        const results = {
            openapi_path: null,
            graphql_path: null,
        };

        await fs.mkdir(outputDir, { recursive: true });

        // Gather endpoints
        const endpoints = ctx.targetModel.getEndpoints();

        // Check for existing schema fragments
        const openapiEvents = ctx.evidenceGraph.getEventsByType('openapi_fragment');
        const graphqlEvents = ctx.evidenceGraph.getEventsByType('graphql_schema');

        if (format === 'openapi' || format === 'both') {
            const openapi = await this.generateOpenAPI(ctx, target, endpoints, openapiEvents);
            const openapiPath = path.join(outputDir, 'openapi.json');
            await fs.writeFile(openapiPath, JSON.stringify(openapi, null, 2));
            results.openapi_path = openapiPath;

            // Register in manifest
            ctx.manifest.addEntry({
                path: openapiPath,
                generated_from: endpoints.map(e => e.id),
                evidence_refs: openapiEvents.map(e => e.id),
                epistemic: this.createSchemaEpistemic(ctx, endpoints),
            });
        }

        if (format === 'graphql' || format === 'both') {
            const graphql = await this.generateGraphQL(ctx, target, endpoints, graphqlEvents);
            const graphqlPath = path.join(outputDir, 'schema.graphql');
            await fs.writeFile(graphqlPath, graphql);
            results.graphql_path = graphqlPath;

            ctx.manifest.addEntry({
                path: graphqlPath,
                generated_from: endpoints.map(e => e.id),
                evidence_refs: graphqlEvents.map(e => e.id),
                epistemic: this.createSchemaEpistemic(ctx, endpoints),
            });
        }

        return results;
    }

    /**
     * Generate OpenAPI specification
     */
    async generateOpenAPI(ctx, target, endpoints, existingFragments) {
        const url = new URL(target);

        const spec = {
            openapi: '3.0.3',
            info: {
                title: `${url.hostname} API`,
                description: 'Auto-generated OpenAPI specification from LSG v2',
                version: '1.0.0',
                'x-lsg-generated': true,
            },
            servers: [
                { url: target, description: 'Target server' },
            ],
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {},
            },
        };

        // Merge existing fragments
        for (const fragment of existingFragments) {
            const payload = fragment.payload;
            if (payload.paths) {
                Object.assign(spec.paths, payload.paths);
            }
            if (payload.components) {
                Object.assign(spec.components.schemas, payload.components?.schemas || {});
            }
        }

        // Add endpoints from model
        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '/';
            const method = (endpoint.attributes.method || 'get').toLowerCase();
            const params = endpoint.attributes.params || [];

            if (!spec.paths[path]) {
                spec.paths[path] = {};
            }

            // Skip if already defined from fragment
            if (spec.paths[path][method]) continue;

            spec.paths[path][method] = {
                summary: `${method.toUpperCase()} ${path}`,
                description: `Discovered endpoint (confidence: ${this.getEndpointConfidence(ctx, endpoint).toFixed(2)})`,
                parameters: params
                    .filter(p => p.location !== 'body')
                    .map(p => ({
                        name: p.name,
                        in: p.location === 'path' ? 'path' : 'query',
                        required: p.location === 'path',
                        schema: { type: this.mapType(p.type) },
                    })),
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: { type: 'object' },
                            },
                        },
                    },
                },
            };

            // Add request body for POST/PUT/PATCH
            if (['post', 'put', 'patch'].includes(method)) {
                const bodyParams = params.filter(p => p.location === 'body');
                if (bodyParams.length > 0) {
                    const properties = {};
                    for (const p of bodyParams) {
                        properties[p.name] = { type: this.mapType(p.type) };
                    }

                    spec.paths[path][method].requestBody = {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties,
                                },
                            },
                        },
                    };
                }
            }
        }

        // Add auth if detected
        const authClaims = ctx.ledger.getClaimsByType('auth_mechanism');
        if (authClaims.length > 0) {
            const auth = authClaims[0].predicate;
            if (auth.mechanism === 'jwt') {
                spec.components.securitySchemes.bearerAuth = {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                };
                spec.security = [{ bearerAuth: [] }];
            }
        }

        return spec;
    }

    /**
     * Generate GraphQL schema
     */
    async generateGraphQL(ctx, target, endpoints, existingSchemas) {
        // If we have introspected schema, use it
        if (existingSchemas.length > 0) {
            const schema = existingSchemas[0].payload;
            // Convert introspection to SDL if needed
            return this.formatGraphQLFromIntrospection(schema);
        }

        // Generate from endpoints using LLM
        ctx.recordTokens(2000);

        const prompt = `Generate a GraphQL schema based on these REST endpoints:

${JSON.stringify(endpoints.slice(0, 30).map(e => ({
            path: e.attributes.path,
            method: e.attributes.method,
            params: e.attributes.params,
        })), null, 2)}

Create:
1. Types for each resource (infer from endpoint paths)
2. Query operations for GET endpoints
3. Mutation operations for POST/PUT/DELETE endpoints
4. Input types for mutations

Return only valid GraphQL SDL, no explanations.`;

        const response = await this.llm.generate(prompt, {
            capability: LLM_CAPABILITIES.SCHEMA_COMPLETION,
        });

        if (response.success) {
            ctx.recordTokens(response.tokens_used);

            // Extract schema from response
            let schema = response.content;
            const schemaMatch = schema.match(/```(?:graphql)?\s*([\s\S]*?)```/);
            if (schemaMatch) {
                schema = schemaMatch[1];
            }

            return schema.trim();
        }

        // Fallback: generate basic schema
        return this.generateBasicGraphQL(endpoints);
    }

    /**
     * Format GraphQL from introspection
     */
    formatGraphQLFromIntrospection(introspection) {
        const types = introspection.types || [];
        let schema = '# LSG v2 Generated GraphQL Schema\n\n';

        for (const type of types) {
            if (type.name.startsWith('__')) continue;

            if (type.kind === 'OBJECT') {
                schema += `type ${type.name} {\n`;
                for (const field of type.fields || []) {
                    const fieldType = this.formatGraphQLType(field.type);
                    schema += `  ${field.name}: ${fieldType}\n`;
                }
                schema += '}\n\n';
            }
        }

        return schema;
    }

    formatGraphQLType(type) {
        if (!type) return 'String';
        if (type.kind === 'NON_NULL') return `${this.formatGraphQLType(type.ofType)}!`;
        if (type.kind === 'LIST') return `[${this.formatGraphQLType(type.ofType)}]`;
        return type.name || 'String';
    }

    /**
     * Generate basic GraphQL schema from endpoints
     */
    generateBasicGraphQL(endpoints) {
        const resources = new Set();

        for (const ep of endpoints) {
            const path = ep.attributes.path || '';
            const segments = path.split('/').filter(s => s && !s.startsWith(':') && !['api', 'v1', 'v2'].includes(s));
            if (segments.length > 0) {
                resources.add(segments[0]);
            }
        }

        let schema = '# LSG v2 Generated GraphQL Schema\n\n';

        // Generate types
        for (const resource of resources) {
            const typeName = resource.charAt(0).toUpperCase() + resource.slice(1);
            schema += `type ${typeName} {\n  id: ID!\n  createdAt: String\n  updatedAt: String\n}\n\n`;
        }

        // Query type
        schema += 'type Query {\n';
        for (const resource of resources) {
            const typeName = resource.charAt(0).toUpperCase() + resource.slice(1);
            schema += `  ${resource}s: [${typeName}!]!\n`;
            schema += `  ${resource}(id: ID!): ${typeName}\n`;
        }
        schema += '}\n\n';

        // Mutation type
        schema += 'type Mutation {\n';
        for (const resource of resources) {
            const typeName = resource.charAt(0).toUpperCase() + resource.slice(1);
            schema += `  create${typeName}(input: ${typeName}Input!): ${typeName}!\n`;
            schema += `  update${typeName}(id: ID!, input: ${typeName}Input!): ${typeName}!\n`;
            schema += `  delete${typeName}(id: ID!): Boolean!\n`;
        }
        schema += '}\n';

        return schema;
    }

    mapType(lsgType) {
        const typeMap = {
            string: 'string',
            integer: 'integer',
            number: 'number',
            boolean: 'boolean',
            array: 'array',
            object: 'object',
            uuid: 'string',
            email: 'string',
            date: 'string',
        };
        return typeMap[lsgType] || 'string';
    }

    getEndpointConfidence(ctx, endpoint) {
        const claims = ctx.ledger.getClaimsForSubject(endpoint.id);
        if (claims.length === 0) return 0.5;

        const probs = claims.map(c => c.getExpectedProbability(ctx.ledger.config));
        return probs.reduce((a, b) => a + b, 0) / probs.length;
    }

    createSchemaEpistemic(ctx, endpoints) {
        const confidences = endpoints.map(e => this.getEndpointConfidence(ctx, e));
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / (confidences.length || 1);

        return createEpistemicEnvelope(
            { b: avgConfidence, d: 0, u: 1 - avgConfidence, a: 0.5 },
            [],
            [],
            avgConfidence < 0.6 ? ['Some endpoints have low confidence'] : []
        );
    }
}

export default SchemaGenAgent;
