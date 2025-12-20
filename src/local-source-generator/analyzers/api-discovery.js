/**
 * API Discovery Module
 * 
 * Discovers API schemas, GraphQL introspection, and API endpoints from JS bundles.
 */

import { withTimeout } from '../utils/resilience.js';

/**
 * Common API schema paths to probe
 */
const API_SCHEMA_PATHS = [
    // OpenAPI/Swagger
    '/swagger.json',
    '/swagger.yaml',
    '/api/swagger.json',
    '/api-docs',
    '/api-docs.json',
    '/v1/api-docs',
    '/v2/api-docs',
    '/v3/api-docs',
    '/api/v1/swagger.json',
    '/api/v2/swagger.json',
    '/openapi.json',
    '/openapi.yaml',
    '/api/openapi.json',
    '/.well-known/openapi.json',
    '/docs/openapi.json',

    // GraphQL
    '/graphql',
    '/api/graphql',
    '/v1/graphql',
    '/graphiql',
    '/api/graphiql',
    '/playground',
    '/explorer',

    // Other
    '/api',
    '/api/v1',
    '/api/v2',
    '/api/v3',
    '/_api',
    '/rest',
    '/rest/api'
];

/**
 * GraphQL introspection query
 */
const GRAPHQL_INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
        }
      }
    }
  }
}
`;

/**
 * Discover OpenAPI/Swagger schemas
 * 
 * @param {string} baseUrl - Base URL to probe
 * @returns {Promise<Array>} - Discovered schemas
 */
export async function discoverOpenAPISchemas(baseUrl) {
    const discovered = [];

    for (const schemaPath of API_SCHEMA_PATHS.filter(p => !p.includes('graph'))) {
        try {
            const url = new URL(schemaPath, baseUrl).toString();
            const response = await withTimeout(
                () => fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                }),
                5000,
                `Probing ${schemaPath}`
            );

            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';

                if (contentType.includes('json') || contentType.includes('yaml')) {
                    try {
                        const schema = await response.json();

                        // Validate it looks like OpenAPI
                        if (schema.openapi || schema.swagger || schema.paths) {
                            discovered.push({
                                path: schemaPath,
                                url,
                                type: schema.openapi ? 'OpenAPI 3.x' : 'Swagger 2.x',
                                version: schema.openapi || schema.swagger,
                                title: schema.info?.title,
                                endpoints: Object.keys(schema.paths || {}).length,
                                schema
                            });
                        }
                    } catch {
                        // Not valid JSON, skip
                    }
                }
            }
        } catch {
            // Probe failed, continue
        }
    }

    return discovered;
}

/**
 * Attempt GraphQL introspection
 * 
 * @param {string} baseUrl - Base URL to probe
 * @returns {Promise<Object|null>} - GraphQL schema or null
 */
export async function introspectGraphQL(baseUrl) {
    const graphqlPaths = API_SCHEMA_PATHS.filter(p => p.includes('graph') || p.includes('playground'));

    for (const gqlPath of graphqlPaths) {
        try {
            const url = new URL(gqlPath, baseUrl).toString();

            const response = await withTimeout(
                () => fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ query: GRAPHQL_INTROSPECTION_QUERY })
                }),
                10000,
                `GraphQL introspection at ${gqlPath}`
            );

            if (response.ok) {
                const result = await response.json();

                if (result.data?.__schema) {
                    return {
                        path: gqlPath,
                        url,
                        type: 'GraphQL',
                        schema: result.data.__schema,
                        types: result.data.__schema.types?.length || 0,
                        queries: result.data.__schema.queryType?.name ? 'available' : 'none',
                        mutations: result.data.__schema.mutationType?.name ? 'available' : 'none'
                    };
                }
            }
        } catch {
            // Introspection failed, continue
        }
    }

    return null;
}

/**
 * Extract API endpoints from JavaScript bundles
 * 
 * @param {Array} jsFiles - Array of JS file analysis objects
 * @returns {Array} - Discovered API endpoints
 */
export function extractAPIsFromJS(jsFiles) {
    const apis = [];
    const seen = new Set();

    for (const jsFile of jsFiles) {
        for (const endpoint of jsFile.endpoints || []) {
            if (!seen.has(endpoint)) {
                seen.add(endpoint);
                apis.push({
                    path: endpoint,
                    source: jsFile.url,
                    method: inferMethodFromPath(endpoint),
                    type: classifyEndpoint(endpoint)
                });
            }
        }
    }

    return apis;
}

/**
 * Infer HTTP method from path pattern
 */
function inferMethodFromPath(path) {
    const pathLower = path.toLowerCase();

    if (pathLower.includes('delete') || pathLower.includes('remove')) return 'DELETE';
    if (pathLower.includes('create') || pathLower.includes('add') || pathLower.includes('new')) return 'POST';
    if (pathLower.includes('update') || pathLower.includes('edit') || pathLower.includes('modify')) return 'PUT';
    if (pathLower.includes('patch')) return 'PATCH';

    return 'GET';
}

/**
 * Classify endpoint type
 */
function classifyEndpoint(path) {
    const pathLower = path.toLowerCase();

    if (pathLower.includes('/auth') || pathLower.includes('/login') || pathLower.includes('/session')) {
        return 'authentication';
    }
    if (pathLower.includes('/user') || pathLower.includes('/profile') || pathLower.includes('/account')) {
        return 'user-management';
    }
    if (pathLower.includes('/admin') || pathLower.includes('/manage')) {
        return 'admin';
    }
    if (pathLower.includes('/upload') || pathLower.includes('/file') || pathLower.includes('/media')) {
        return 'file-handling';
    }
    if (pathLower.includes('/search') || pathLower.includes('/query') || pathLower.includes('/filter')) {
        return 'search';
    }
    if (pathLower.includes('/webhook') || pathLower.includes('/callback') || pathLower.includes('/notify')) {
        return 'webhook';
    }
    if (pathLower.includes('/pay') || pathLower.includes('/checkout') || pathLower.includes('/order')) {
        return 'payment';
    }

    return 'general';
}

/**
 * Generate schemathesis-compatible test configuration
 * 
 * @param {Object} schema - OpenAPI schema
 * @param {string} baseUrl - Base URL
 * @returns {Object} - Schemathesis config
 */
export function generateSchemathesisConfig(schema, baseUrl) {
    return {
        schema: schema.url || `${baseUrl}/openapi.json`,
        base_url: baseUrl,
        checks: [
            'not_a_server_error',
            'status_code_conformance',
            'content_type_conformance',
            'response_schema_conformance'
        ],
        hypothesis: {
            max_examples: 100,
            deadline: 30000
        },
        operations: Object.keys(schema.schema?.paths || {}).map(path => ({
            path,
            methods: Object.keys(schema.schema.paths[path] || {})
        }))
    };
}

/**
 * Comprehensive API discovery
 * 
 * @param {string} baseUrl - Target base URL
 * @param {Array} jsFiles - Analyzed JS files
 * @returns {Promise<Object>} - Complete API discovery results
 */
export async function discoverAPIs(baseUrl, jsFiles = []) {
    const results = {
        openapi: [],
        graphql: null,
        fromJS: [],
        summary: {
            totalEndpoints: 0,
            hasOpenAPI: false,
            hasGraphQL: false,
            endpointTypes: {}
        }
    };

    // Discover OpenAPI schemas
    results.openapi = await discoverOpenAPISchemas(baseUrl);
    results.summary.hasOpenAPI = results.openapi.length > 0;

    // Try GraphQL introspection
    results.graphql = await introspectGraphQL(baseUrl);
    results.summary.hasGraphQL = results.graphql !== null;

    // Extract from JS bundles
    results.fromJS = extractAPIsFromJS(jsFiles);

    // Calculate summary
    const allEndpoints = [
        ...results.fromJS,
        ...results.openapi.flatMap(s =>
            Object.keys(s.schema?.paths || {}).map(p => ({ path: p }))
        )
    ];

    results.summary.totalEndpoints = allEndpoints.length;

    for (const ep of allEndpoints) {
        const type = ep.type || classifyEndpoint(ep.path);
        results.summary.endpointTypes[type] = (results.summary.endpointTypes[type] || 0) + 1;
    }

    return results;
}

export { API_SCHEMA_PATHS, GRAPHQL_INTROSPECTION_QUERY };
