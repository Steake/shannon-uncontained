/**
 * DataFlowMapper - Data flow mapping agent
 * 
 * Maps source-to-sink data flows and identifies potential taint paths.
 * Creates edges in TargetModel with flow relationships.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';
import { RELATIONSHIP_TYPES } from '../../worldmodel/target-model.js';

export class DataFlowMapper extends BaseAgent {
    constructor(options = {}) {
        super('DataFlowMapper', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                flows: { type: 'array' },
                sources: { type: 'array' },
                sinks: { type: 'array' },
            },
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered', 'form_discovered'],
            model_nodes: ['endpoint', 'parameter'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: ['data_flow_edge'],
            claims: [CLAIM_TYPES.DATA_FLOW],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 5,
            max_tokens: 8000,
            max_tool_invocations: 5,
        };

        this.llm = getLLMClient();

        // Source patterns (user input)
        this.sourcePatterns = {
            query_param: { pattern: /\?.*=/, risk: 'high' },
            path_param: { pattern: /\/:\w+|\/\{\w+\}/, risk: 'high' },
            body_input: { pattern: /POST|PUT|PATCH/, risk: 'high' },
            file_upload: { pattern: /upload|file|attachment/i, risk: 'high' },
            header: { pattern: /header|authorization/i, risk: 'medium' },
        };

        // Sink patterns (sensitive operations)
        this.sinkPatterns = {
            database: { pattern: /\/db|\/query|\/sql|\/search/i, risk: 'critical' },
            command: { pattern: /\/exec|\/run|\/shell|\/cmd/i, risk: 'critical' },
            file_system: { pattern: /\/file|\/read|\/write|\/download/i, risk: 'high' },
            redirect: { pattern: /\/redirect|\/goto|return_url|next=/i, risk: 'high' },
            template: { pattern: /\/render|\/template|\/view/i, risk: 'medium' },
            email: { pattern: /\/email|\/mail|\/notify/i, risk: 'medium' },
            admin: { pattern: /\/admin|\/manage|\/config/i, risk: 'high' },
        };
    }

    async run(ctx, inputs) {
        const { target } = inputs;

        const results = {
            flows: [],
            sources: [],
            sinks: [],
            risk_summary: {},
        };

        // Get all endpoints
        const endpoints = ctx.targetModel.getEndpoints();

        // Identify sources and sinks
        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const method = endpoint.attributes.method || 'GET';
            const params = endpoint.attributes.params || [];

            // Check for sources
            const sources = this.identifySources(path, method, params);
            for (const source of sources) {
                results.sources.push({
                    endpoint: path,
                    method,
                    source_type: source.type,
                    risk: source.risk,
                });
            }

            // Check for sinks
            const sinks = this.identifySinks(path);
            for (const sink of sinks) {
                results.sinks.push({
                    endpoint: path,
                    sink_type: sink.type,
                    risk: sink.risk,
                });
            }
        }

        // Use LLM to infer data flows between sources and sinks
        if (results.sources.length > 0 && results.sinks.length > 0) {
            ctx.recordTokens(1500);

            const prompt = this.buildPrompt(target, endpoints, results.sources, results.sinks);

            const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
                capability: LLM_CAPABILITIES.EXTRACT_CLAIMS,
            });

            if (response.success && response.data) {
                ctx.recordTokens(response.tokens_used);

                for (const flow of response.data.flows || []) {
                    results.flows.push(flow);

                    // Create edge in target model
                    const sourceId = `endpoint:${flow.source_method}:${flow.source_endpoint}`;
                    const sinkId = `endpoint:${flow.sink_method || 'GET'}:${flow.sink_endpoint}`;

                    ctx.targetModel.addEdge({
                        source: sourceId,
                        target: sinkId,
                        relationship: RELATIONSHIP_TYPES.FLOWS_TO,
                        claim_refs: [],
                    });

                    // Emit claim
                    const claim = ctx.emitClaim({
                        claim_type: CLAIM_TYPES.DATA_FLOW,
                        subject: `${flow.source_endpoint}->${flow.sink_endpoint}`,
                        predicate: {
                            source: flow.source_endpoint,
                            sink: flow.sink_endpoint,
                            flow_type: flow.flow_type,
                            risk: flow.risk,
                        },
                        base_rate: 0.2, // Conservative for inferred flows
                    });

                    if (claim) {
                        claim.addEvidence('crawl_inferred', flow.confidence || 0.5);
                    }
                }
            }
        }

        // Calculate risk summary
        results.risk_summary = {
            critical_sinks: results.sinks.filter(s => s.risk === 'critical').length,
            high_risk_flows: results.flows.filter(f => f.risk === 'high' || f.risk === 'critical').length,
            total_flows: results.flows.length,
        };

        return results;
    }

    identifySources(path, method, params) {
        const sources = [];

        // POST/PUT/PATCH are always sources
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            sources.push({ type: 'body_input', risk: 'high' });
        }

        // Check for query params
        if (params.some(p => p.location === 'query')) {
            sources.push({ type: 'query_param', risk: 'high' });
        }

        // Check for path params
        if (params.some(p => p.location === 'path')) {
            sources.push({ type: 'path_param', risk: 'high' });
        }

        // Check for file upload patterns
        if (this.sourcePatterns.file_upload.pattern.test(path)) {
            sources.push({ type: 'file_upload', risk: 'high' });
        }

        return sources;
    }

    identifySinks(path) {
        const sinks = [];

        for (const [type, { pattern, risk }] of Object.entries(this.sinkPatterns)) {
            if (pattern.test(path)) {
                sinks.push({ type, risk });
            }
        }

        return sinks;
    }

    buildPrompt(target, endpoints, sources, sinks) {
        return `Analyze potential data flow paths in this application:

Target: ${target}

## Endpoints with User Input (Sources):
${JSON.stringify(sources.slice(0, 20), null, 2)}

## Endpoints with Sensitive Operations (Sinks):
${JSON.stringify(sinks.slice(0, 20), null, 2)}

## All Endpoints (${endpoints.length} total):
${JSON.stringify(endpoints.slice(0, 30).map(e => ({
            path: e.attributes.path,
            method: e.attributes.method,
            params: e.attributes.params?.map(p => p.name),
        })), null, 2)}

## Task:
Identify likely data flow paths where user input from a source endpoint may reach a sensitive sink:
1. Look for logical connections (e.g., /users POST -> /users/:id/admin)
2. Consider parameter propagation and data relationships
3. Assess the risk level based on source-sink combinations
4. Note the flow type (direct, indirect, multi-step)

Focus on high-confidence flows with security implications.`;
    }

    getOutputSchema() {
        return {
            type: 'object',
            required: ['flows'],
            properties: {
                flows: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['source_endpoint', 'sink_endpoint'],
                        properties: {
                            source_endpoint: { type: 'string' },
                            source_method: { type: 'string' },
                            sink_endpoint: { type: 'string' },
                            sink_method: { type: 'string' },
                            flow_type: {
                                type: 'string',
                                enum: ['direct', 'indirect', 'multi_step', 'inferred'],
                            },
                            data_types: { type: 'array', items: { type: 'string' } },
                            risk: {
                                type: 'string',
                                enum: ['critical', 'high', 'medium', 'low'],
                            },
                            confidence: { type: 'number' },
                            reasoning: { type: 'string' },
                        },
                    },
                },
            },
        };
    }
}

export default DataFlowMapper;
