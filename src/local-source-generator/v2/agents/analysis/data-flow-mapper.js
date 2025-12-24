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
                recursion_depth: { type: 'number', description: 'Max depth for function call tracing (1-5)', default: 2 }
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                flows: { type: 'array' },
                sources: { type: 'array' },
                sinks: { type: 'array' },
                call_graph: { type: 'object' }
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
            max_time_ms: 300000, // 5 mins for deep analysis
            max_network_requests: 20,
            max_tokens: 32000,
            max_tool_invocations: 15,
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
        const { target, recursion_depth = 2 } = inputs;

        const results = {
            flows: [],
            sources: [],
            sinks: [],
            risk_summary: {},
            call_graph: {}
        };

        // Get all endpoints
        const endpoints = ctx.targetModel.getEndpoints();

        // 1. Identification Phase
        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const method = endpoint.attributes.method || 'GET';
            const params = endpoint.attributes.params || [];

            // Gather code context if available (simulated or real)
            const codeContext = endpoint.attributes.code_snippet || '';

            // Check for sources
            const sources = this.identifySources(path, method, params);
            for (const source of sources) {
                results.sources.push({
                    endpoint: path,
                    method,
                    source_type: source.type,
                    risk: source.risk,
                    code_context: codeContext.slice(0, 500) // Truncate for summary
                });
            }

            // Check for sinks
            const sinks = this.identifySinks(path);
            for (const sink of sinks) {
                results.sinks.push({
                    endpoint: path,
                    sink_type: sink.type,
                    risk: sink.risk,
                    code_context: codeContext.slice(0, 500)
                });
            }
        }

        // 2. Recursive Context Gathering (Deep Analysis)
        // In a real implementation this would crawl the AST. Here we simulate deeper context 
        // by expanding the "code_context" using LLM inference if it's a synthetic target,
        // or just using the provided depth to prompt for more logic.

        ctx.log(`Analyzing ${results.sources.length} sources and ${results.sinks.length} sinks with recursion depth ${recursion_depth}`);

        // 3. Taint Analysis Phase
        if (results.sources.length > 0 && results.sinks.length > 0) {
            ctx.recordTokens(3000);

            // Batch processing for large APIs
            const batchSize = 10;
            for (let i = 0; i < results.sources.length; i += batchSize) {
                const sourceBatch = results.sources.slice(i, i + batchSize);

                const prompt = this.buildAdvancedPrompt(target, endpoints, sourceBatch, results.sinks, recursion_depth);

                const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
                    capability: LLM_CAPABILITIES.CODE_ANALYSIS, // Use smarter model
                    temperature: 0.1
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
                            attributes: {
                                taint_path: flow.taint_path || [],
                                confidence: flow.confidence
                            }
                        });

                        // Emit claim with higher precision
                        const claim = ctx.emitClaim({
                            claim_type: CLAIM_TYPES.DATA_FLOW,
                            subject: `${flow.source_endpoint}->${flow.sink_endpoint}`,
                            predicate: {
                                source: flow.source_endpoint,
                                sink: flow.sink_endpoint,
                                flow_type: flow.flow_type,
                                risk: flow.risk,
                                taint_path: flow.taint_path
                            },
                            base_rate: flow.confidence || 0.4,
                        });

                        if (claim) {
                            claim.addEvidence('deep_taint_analysis', flow.confidence || 0.6);
                        }
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

    buildAdvancedPrompt(target, endpoints, sources, sinks, depth) {
        return `Perform Deep Taint Analysis on the following application endpoints.
        
Target: ${target}
Recursion Depth: ${depth} (Trace internal function calls up to this depth)

## Sources (User Input Entry Points):
${JSON.stringify(sources, null, 2)}

## Sinks (Sensitive Operations):
${JSON.stringify(sinks.slice(0, 50), null, 2)}

## Context (Available Endpoints):
${JSON.stringify(endpoints.slice(0, 50).map(e => ({
            path: e.attributes.path,
            method: e.attributes.method,
            params: e.attributes.params?.map(p => p.name)
        })), null, 2)}

## Task:
Map data flows from Sources to Sinks. 
1. **Trace Taint**: Imagine how 'req.body' or 'req.query' propagates through variables.
2. **identify Sanitization**: Note if input appears to be validated/sanitized (e.g. parseInt, escapeHTML).
3. **Function Chaining**: If a controller calls a service function, assume data passes through unless explicitly blocked.
4. **Risk Calculation**: 
   - Direct flow to SQL sink = Critical
   - Flow to File System = High
   - Reflected in Response = Medium (XSS risk)

Return ONLY high-confidence, exploitable flows.`;
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
                            taint_path: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of variables/functions the data passes through'
                            },
                            sanitization_detected: { type: 'boolean' },
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
