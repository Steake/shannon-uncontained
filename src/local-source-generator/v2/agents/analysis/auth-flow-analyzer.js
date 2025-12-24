/**
 * AuthFlowAnalyzer - Authentication flow analysis agent
 * 
 * Analyzes authentication mechanisms, session management, and auth flows.
 * Emits claims about auth architecture with evidence.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';
import { ENTITY_TYPES } from '../../worldmodel/target-model.js';

export class AuthFlowAnalyzer extends BaseAgent {
    constructor(options = {}) {
        super('AuthFlowAnalyzer', options);

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
                auth_mechanism: { type: 'string' },
                session_storage: { type: 'string' },
                auth_endpoints: { type: 'array' },
                flows: { type: 'array' },
            },
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered', 'form_discovered', 'js_fetch_call'],
            model_nodes: ['endpoint'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: ['auth_flow'],
            claims: [CLAIM_TYPES.AUTH_MECHANISM],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 90000,
            max_network_requests: 5,
            max_tokens: 6000,
            max_tool_invocations: 3,
        };

        this.llm = getLLMClient();

        // Auth-related path patterns
        this.authPatterns = {
            login: /\/(login|signin|auth|authenticate|session)/i,
            register: /\/(register|signup|create-account)/i,
            logout: /\/(logout|signout|session\/destroy)/i,
            oauth: /\/(oauth|callback|authorize)/i,
            token: /\/(token|refresh|jwt)/i,
            password: /\/(password|reset|forgot|recover)/i,
            mfa: /\/(mfa|2fa|otp|verify)/i,
        };
    }

    async run(ctx, inputs) {
        const { target } = inputs;

        const results = {
            auth_mechanism: 'unknown',
            session_storage: 'unknown',
            auth_endpoints: [],
            flows: [],
            vulnerabilities: [],
        };

        // Gather auth-related endpoints
        const endpoints = ctx.targetModel.getEndpoints();
        const authEndpoints = this.findAuthEndpoints(endpoints);
        results.auth_endpoints = authEndpoints;

        // Check JS for auth patterns
        const jsEvents = ctx.evidenceGraph.getEventsByType('js_fetch_call');
        const authJsCalls = jsEvents.filter(e =>
            this.isAuthRelated(e.payload.endpoint || '')
        );

        // Look for technology hints
        const techEvents = ctx.evidenceGraph.getEventsByType('tech_detection');
        const authTech = this.detectAuthTechnology(techEvents);

        // Use LLM for deeper analysis if we have auth endpoints
        if (authEndpoints.length > 0 || authJsCalls.length > 0) {
            ctx.recordTokens(1000);

            const prompt = this.buildPrompt(target, authEndpoints, authJsCalls, authTech);

            const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
                capability: LLM_CAPABILITIES.EXTRACT_CLAIMS,
            });

            if (response.success && response.data) {
                ctx.recordTokens(response.tokens_used);

                const analysis = response.data;

                results.auth_mechanism = analysis.mechanism || 'unknown';
                results.session_storage = analysis.session_storage || 'unknown';
                results.flows = analysis.flows || [];
                results.vulnerabilities = analysis.potential_vulnerabilities || [];

                // Create auth flow entity
                ctx.targetModel.addEntity({
                    id: `auth_flow:${target}`,
                    entity_type: ENTITY_TYPES.AUTH_FLOW,
                    attributes: {
                        mechanism: results.auth_mechanism,
                        session_storage: results.session_storage,
                        endpoints: authEndpoints.map(e => e.path),
                        flows: results.flows,
                    },
                    claim_refs: [],
                });

                // Emit claim
                const claim = ctx.emitClaim({
                    claim_type: CLAIM_TYPES.AUTH_MECHANISM,
                    subject: target,
                    predicate: {
                        mechanism: results.auth_mechanism,
                        storage: results.session_storage,
                    },
                    base_rate: 0.3,
                });

                if (claim) {
                    // Add evidence based on what we found
                    if (authEndpoints.length > 0) {
                        claim.addEvidence('crawl_observed', authEndpoints.length * 0.5);
                    }
                    if (authJsCalls.length > 0) {
                        claim.addEvidence('js_ast_direct', authJsCalls.length * 0.3);
                    }
                    if (authTech.length > 0) {
                        claim.addEvidence('crawl_inferred', authTech.length);
                    }
                }
            }
        }

        return results;
    }

    findAuthEndpoints(endpoints) {
        const authEndpoints = [];

        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const method = endpoint.attributes.method || 'GET';

            for (const [type, pattern] of Object.entries(this.authPatterns)) {
                if (pattern.test(path)) {
                    authEndpoints.push({
                        path,
                        method,
                        auth_type: type,
                    });
                    break;
                }
            }
        }

        return authEndpoints;
    }

    isAuthRelated(path) {
        return Object.values(this.authPatterns).some(p => p.test(path));
    }

    detectAuthTechnology(techEvents) {
        const authTechnologies = [];
        const authKeywords = ['jwt', 'oauth', 'passport', 'auth0', 'firebase', 'cognito', 'keycloak', 'okta'];

        for (const event of techEvents) {
            const tech = (event.payload.technology || '').toLowerCase();
            if (authKeywords.some(kw => tech.includes(kw))) {
                authTechnologies.push(event.payload.technology);
            }
        }

        return authTechnologies;
    }

    buildPrompt(target, authEndpoints, jsCalls, authTech) {
        return `Analyze the authentication architecture of this web application:

Target: ${target}

## Authentication Endpoints Found:
${JSON.stringify(authEndpoints, null, 2)}

## JavaScript Auth-Related API Calls:
${JSON.stringify(jsCalls.map(e => e.payload), null, 2)}

## Auth Technologies Detected:
${authTech.join(', ') || 'None specifically detected'}

## Task:
1. Identify the primary authentication mechanism (JWT, session cookies, OAuth, API keys, etc.)
2. Determine session/token storage method (localStorage, sessionStorage, httpOnly cookies, etc.)
3. Map common auth flows (login, register, logout, password reset, MFA)
4. Note any potential security concerns based on patterns observed

Be specific about evidence for each claim.`;
    }

    getOutputSchema() {
        return {
            type: 'object',
            required: ['mechanism'],
            properties: {
                mechanism: {
                    type: 'string',
                    enum: ['jwt', 'session_cookie', 'oauth2', 'api_key', 'basic_auth', 'saml', 'unknown'],
                },
                session_storage: {
                    type: 'string',
                    enum: ['httponly_cookie', 'localStorage', 'sessionStorage', 'header', 'unknown'],
                },
                flows: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            steps: { type: 'array', items: { type: 'string' } },
                            endpoints: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
                potential_vulnerabilities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            description: { type: 'string' },
                            endpoints: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
                confidence: { type: 'number' },
            },
        };
    }
}

export default AuthFlowAnalyzer;
