/**
 * BusinessLogicAgent - Business logic and workflow analysis agent
 * 
 * Identifies state machines, workflows, and business rules from
 * endpoint patterns and form sequences.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { ENTITY_TYPES } from '../../worldmodel/target-model.js';

export class BusinessLogicAgent extends BaseAgent {
    constructor(options = {}) {
        super('BusinessLogicAgent', options);

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
                workflows: { type: 'array' },
                state_machines: { type: 'array' },
                business_rules: { type: 'array' },
            },
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered', 'form_discovered', 'js_state_hint'],
            model_nodes: ['endpoint'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: ['workflow'],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 90000,
            max_network_requests: 5,
            max_tokens: 6000,
            max_tool_invocations: 3,
        };

        this.llm = getLLMClient();

        // Common workflow patterns
        this.workflowPatterns = {
            checkout: {
                steps: ['cart', 'checkout', 'payment', 'confirm', 'order'],
                indicators: [/cart/, /checkout/, /payment/, /order/],
            },
            registration: {
                steps: ['register', 'verify', 'profile', 'activate'],
                indicators: [/register/, /signup/, /verify/, /activate/],
            },
            booking: {
                steps: ['search', 'select', 'book', 'confirm', 'ticket'],
                indicators: [/book/, /reserve/, /schedule/, /appointment/],
            },
            application: {
                steps: ['apply', 'submit', 'review', 'approve', 'reject'],
                indicators: [/apply/, /submit/, /pending/, /approve/],
            },
            crud: {
                steps: ['list', 'create', 'view', 'edit', 'delete'],
                indicators: [/list/, /new/, /edit/, /delete/],
            },
        };
    }

    async run(ctx, inputs) {
        const { target } = inputs;

        const results = {
            workflows: [],
            state_machines: [],
            business_rules: [],
        };

        // Gather evidence
        const endpoints = ctx.targetModel.getEndpoints();
        const forms = ctx.evidenceGraph.getEventsByType('form_discovered');
        const stateHints = ctx.evidenceGraph.getEventsByType('js_state_hint');

        // Pattern-based workflow detection
        const detectedWorkflows = this.detectWorkflowPatterns(endpoints);

        // Group endpoints by resource
        const resourceGroups = this.groupEndpointsByResource(endpoints);

        // Use LLM for deeper workflow inference
        if (endpoints.length > 5) {
            ctx.recordTokens(1500);

            const prompt = this.buildPrompt(target, endpoints, forms, stateHints, resourceGroups);

            const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
                capability: LLM_CAPABILITIES.INFER_ARCHITECTURE,
            });

            if (response.success && response.data) {
                ctx.recordTokens(response.tokens_used);

                // Process workflows
                for (const workflow of response.data.workflows || []) {
                    results.workflows.push(workflow);

                    // Add to target model
                    ctx.targetModel.addEntity({
                        id: `workflow:${workflow.name}`,
                        entity_type: ENTITY_TYPES.WORKFLOW,
                        attributes: {
                            name: workflow.name,
                            steps: workflow.steps,
                            entry_points: workflow.entry_points,
                            completion_criteria: workflow.completion_criteria,
                        },
                        claim_refs: [],
                    });
                }

                // Process state machines
                for (const sm of response.data.state_machines || []) {
                    results.state_machines.push(sm);
                }

                // Process business rules
                results.business_rules = response.data.business_rules || [];
            }
        }

        // Merge with pattern-detected workflows
        for (const w of detectedWorkflows) {
            if (!results.workflows.find(wf => wf.name === w.name)) {
                results.workflows.push(w);
            }
        }

        return results;
    }

    detectWorkflowPatterns(endpoints) {
        const workflows = [];
        const paths = endpoints.map(e => e.attributes.path || '');

        for (const [name, { steps, indicators }] of Object.entries(this.workflowPatterns)) {
            const matchedSteps = [];

            for (const step of steps) {
                const stepPattern = new RegExp(step, 'i');
                const matched = paths.find(p => stepPattern.test(p));
                if (matched) {
                    matchedSteps.push({ step, endpoint: matched });
                }
            }

            // Need at least 2 steps to consider it a workflow
            if (matchedSteps.length >= 2) {
                workflows.push({
                    name: `${name}_workflow`,
                    type: name,
                    steps: matchedSteps,
                    confidence: matchedSteps.length / steps.length,
                    source: 'pattern_detection',
                });
            }
        }

        return workflows;
    }

    groupEndpointsByResource(endpoints) {
        const groups = {};

        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const method = endpoint.attributes.method || 'GET';

            // Extract resource from path (e.g., /api/users/123 -> users)
            const segments = path.split('/').filter(s => s && !s.startsWith(':') && !/^\d+$/.test(s));
            const resource = segments.find(s => !['api', 'v1', 'v2', 'v3'].includes(s)) || 'root';

            if (!groups[resource]) {
                groups[resource] = [];
            }
            groups[resource].push({ path, method });
        }

        return groups;
    }

    buildPrompt(target, endpoints, forms, stateHints, resourceGroups) {
        return `Analyze business logic patterns in this web application:

Target: ${target}

## Endpoints by Resource:
${JSON.stringify(resourceGroups, null, 2)}

## Forms Discovered:
${JSON.stringify(forms.slice(0, 10).map(f => f.payload), null, 2)}

## State Management Hints from JS:
${JSON.stringify(stateHints.slice(0, 10).map(h => h.payload), null, 2)}

## Task:
Identify business logic patterns:
1. Multi-step workflows (e.g., checkout, registration, booking)
2. State machines (e.g., order status: pending -> paid -> shipped)
3. Business rules (e.g., validation, authorization, constraints)

For each pattern:
- Name the workflow/state machine
- List the steps/states and transitions
- Identify entry and exit points
- Note any dependencies or prerequisites`;
    }

    getOutputSchema() {
        return {
            type: 'object',
            properties: {
                workflows: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'steps'],
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        step: { type: 'string' },
                                        endpoint: { type: 'string' },
                                        method: { type: 'string' },
                                    },
                                },
                            },
                            entry_points: { type: 'array', items: { type: 'string' } },
                            completion_criteria: { type: 'string' },
                            confidence: { type: 'number' },
                        },
                    },
                },
                state_machines: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            entity: { type: 'string' },
                            states: { type: 'array', items: { type: 'string' } },
                            transitions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        from: { type: 'string' },
                                        to: { type: 'string' },
                                        trigger: { type: 'string' },
                                        endpoint: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
                business_rules: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            description: { type: 'string' },
                            endpoints_affected: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
            },
        };
    }
}

export default BusinessLogicAgent;
