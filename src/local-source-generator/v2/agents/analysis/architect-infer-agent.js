/**
 * ArchitectInferAgent - Architecture inference agent
 * 
 * Infers application architecture, components, and service boundaries
 * from recon evidence. Uses LLM for higher-order inference.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from '../../worldmodel/target-model.js';
import { Cortex } from '../../ml/cortex.js';

export class ArchitectInferAgent extends BaseAgent {
    constructor(options = {}) {
        super('ArchitectInferAgent', options);

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
                components: { type: 'array' },
                services: { type: 'array' },
                architecture_type: { type: 'string' },
            },
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered', 'tech_detection', 'js_fetch_call'],
            model_nodes: ['endpoint'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: ['component', 'service'],
            claims: [CLAIM_TYPES.COMPONENT],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 10,
            max_tokens: 8000,
            max_tool_invocations: 5,
        };

        this.llm = getLLMClient();
        this.cortex = new Cortex();
        // Lazy load feature collector to avoid circular deps if possible, or just import
        // Assuming FeatureCollector is available via ../../ml/feature-collector.js
    }

    async init() {
        const { FeatureCollector } = await import('../../ml/feature-collector.js');
        this.featureCollector = new FeatureCollector(this.options.outputDir || process.cwd());
        await this.featureCollector.init();
        await this.cortex.init();
    }

    async run(ctx, inputs) {
        if (!this.featureCollector) await this.init();

        const { target } = inputs;

        // Gather evidence from EvidenceGraph
        const endpoints = ctx.targetModel.getEndpoints();
        const techEvents = ctx.evidenceGraph.getEventsByType('tech_detection');
        const jsEvents = ctx.evidenceGraph.getEventsByType('js_fetch_call');

        const results = {
            components: [],
            services: [],
            architecture_type: 'unknown',
            inferences: [],
        };

        // Initialize Cortex
        await this.cortex.init();

        // 1. Deterministic Inference via Cortex
        const { tags } = this.cortex.predictArchitecture(endpoints);
        const framework = tags.length > 0 ? tags[0].label : null;

        // Log data for ArchNet training
        // We aggregate features from endpoints/evidence
        if (this.featureCollector) {
            try {
                // Flatten evidence for logging
                // In a real crawl, we'd log each endpoint or a summary
                const sampleFeatures = {
                    url: target,
                    headers: {}, // TODO: Extract from headers evidence if available
                    htmlTags: [], // TODO: Extract from DOM evidence
                    cookies: [],
                    inferredFramework: framework || 'unknown'
                };
                // Populate from tech events if possible
                // ...
                this.featureCollector.logArchData(sampleFeatures);
            } catch (e) {
                // Ignore logging errors
            }
        }

        // Legacy support helper (to be moved to Cortex eventually)
        const inferredComponents = this.inferComponents(framework, endpoints);

        // Build context for LLM
        const endpointSummary = endpoints.map(e => ({
            method: e.attributes.method,
            path: e.attributes.path,
            params: e.attributes.params?.length || 0,
        }));

        const technologies = [...new Set(techEvents.map(e => e.payload.technology))];

        const jsEndpoints = jsEvents.map(e => ({
            endpoint: e.payload.endpoint,
            method: e.payload.method,
        }));

        // Use LLM to infer architecture
        ctx.recordTokens(1000); // Estimate

        const prompt = this.buildPrompt(target, endpointSummary, technologies, jsEndpoints, framework, inferredComponents);

        const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
            capability: LLM_CAPABILITIES.INFER_ARCHITECTURE,
        });

        if (response.success && response.data) {
            const inference = response.data;
            ctx.recordTokens(response.tokens_used);

            // Process architecture type
            results.architecture_type = inference.architecture_type || 'monolith';

            // Create component claims
            for (const component of inference.components || []) {
                const componentId = `component:${component.name}`;

                // Add to target model
                ctx.targetModel.addEntity({
                    id: componentId,
                    entity_type: ENTITY_TYPES.COMPONENT,
                    attributes: {
                        name: component.name,
                        type: component.type,
                        endpoints: component.endpoints,
                        description: component.description,
                    },
                    claim_refs: [],
                });

                results.components.push(component);

                // Emit claim with uncertainty
                const claim = ctx.emitClaim({
                    claim_type: CLAIM_TYPES.COMPONENT,
                    subject: target,
                    predicate: {
                        name: component.name,
                        type: component.type,
                    },
                    base_rate: 0.3,
                });

                if (claim) {
                    // Add evidence based on confidence
                    const confidence = component.confidence || 0.5;
                    claim.addEvidence('crawl_inferred', confidence * 2);
                    if (technologies.length > 0) {
                        claim.addEvidence('js_ast_heuristic', 1);
                    }
                }

                // Create edges to endpoints
                for (const epPath of component.endpoints || []) {
                    const endpointId = `endpoint:GET:${epPath}`; // Simplified
                    if (ctx.targetModel.getEntity(endpointId)) {
                        ctx.targetModel.addEdge({
                            source: componentId,
                            target: endpointId,
                            relationship: RELATIONSHIP_TYPES.CONTAINS,
                        });
                    }
                }
            }

            // Process services
            for (const service of inference.services || []) {
                ctx.targetModel.addEntity({
                    id: `service:${service.name}`,
                    entity_type: ENTITY_TYPES.SERVICE,
                    attributes: service,
                    claim_refs: [],
                });

                results.services.push(service);
            }

            results.inferences = inference.reasoning || [];
        }

        return results;
    }

    /**
     * Deterministically infer framework and components from route patterns
     */
    /**
     * Logic for inferring components from a detected framework
     * TODO: Move this logic to Cortex
     */
    inferComponents(framework, endpoints) {
        const inferredComponents = [];
        const paths = endpoints.map(e => e.attributes.path);

        // Framework-specific component inference
        if (framework === 'Next.js') {
            // Infer pages from _next/data
            paths.forEach(p => {
                const match = p.match(/\/_next\/data\/[^/]+\/(.+)\.json/);
                if (match) {
                    const pageName = match[1];
                    inferredComponents.push({
                        name: `Page: ${pageName}`,
                        type: 'FrontendComponent',
                        endpoints: [p],
                        description: `Next.js Page Component for ${pageName}`,
                        confidence: 0.9
                    });
                }
            });
        }

        return inferredComponents;
    }

    buildPrompt(target, endpoints, technologies, jsEndpoints, framework, inferredComponents) {
        return `Analyze this web application's architecture based on the discovered evidence:

Target: ${target}

## Detected Framework (Fingerprinted):
${framework !== 'unknown' ? framework : 'None matched'}

## Deterministically Inferred Components:
${inferredComponents.length > 0 ? JSON.stringify(inferredComponents, null, 2) : 'None'}

## Discovered Endpoints (${endpoints.length} total):
${JSON.stringify(endpoints.slice(0, 50), null, 2)}

## Detected Technologies:
${technologies.join(', ') || 'None detected'}

## JavaScript API Calls (${jsEndpoints.length} total):
${JSON.stringify(jsEndpoints.slice(0, 30), null, 2)}

## Task:
Infer the application architecture by:
1. Grouping endpoints into logical components (e.g., auth, users, products, admin)
2. Identifying the architecture pattern (monolith, microservices, SPA+API, etc.)
3. Detecting backend services and their relationships
4. Noting any patterns that suggest specific frameworks or conventions

IMPORTANT: Prioritize the "Detected Framework" and "Inferred Components" if they exist, but feel free to expand on them.
Be conservative - only claim components you have evidence for.
Assign confidence scores (0-1) based on evidence strength.`;
    }

    getOutputSchema() {
        return {
            type: 'object',
            required: ['architecture_type', 'components'],
            properties: {
                architecture_type: {
                    type: 'string',
                    enum: ['monolith', 'microservices', 'spa_api', 'serverless', 'hybrid', 'unknown'],
                },
                components: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'type', 'endpoints'],
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            endpoints: { type: 'array', items: { type: 'string' } },
                            description: { type: 'string' },
                            confidence: { type: 'number' },
                        },
                    },
                },
                services: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            port: { type: 'number' },
                        },
                    },
                },
                reasoning: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
        };
    }
}

export default ArchitectInferAgent;
