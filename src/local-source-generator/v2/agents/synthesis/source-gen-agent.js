/**
 * SourceGenAgent - Source code generation agent
 * 
 * Generates framework-aware pseudo-source code from TargetModel.
 * Includes validation and repair loops.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { EXPRESS_SCAFFOLD } from '../../synthesis/scaffold-packs/express-scaffold.js';
import { FASTAPI_SCAFFOLD } from '../../synthesis/scaffold-packs/fastapi-scaffold.js';
import { ValidationHarness, emitValidationEvidence } from '../../synthesis/validators/validation-harness.js';
import { createEpistemicEnvelope } from '../../worldmodel/artifact-manifest.js';

export class SourceGenAgent extends BaseAgent {
    constructor(options = {}) {
        super('SourceGenAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target', 'outputDir'],
            properties: {
                target: { type: 'string' },
                outputDir: { type: 'string' },
                framework: { type: 'string' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                files: { type: 'array' },
                validation: { type: 'object' },
            },
        };

        this.requires = {
            evidence_kinds: [],
            model_nodes: ['endpoint', 'component', 'auth_flow'],
        };

        this.emits = {
            evidence_events: ['validation_result'],
            model_updates: [],
            claims: [],
            artifacts: ['source_files'],
        };

        this.default_budget = {
            max_time_ms: 300000,
            max_network_requests: 10,
            max_tokens: 20000,
            max_tool_invocations: 20,
        };

        this.llm = getLLMClient();
        this.validator = new ValidationHarness();

        this.scaffolds = {
            express: EXPRESS_SCAFFOLD,
            fastapi: FASTAPI_SCAFFOLD,
        };

        this.maxRepairIterations = 3;
    }

    async run(ctx, inputs) {
        const { target, outputDir, framework } = inputs;

        const results = {
            files: [],
            validation: { passed: 0, failed: 0 },
            framework: null,
            repair_iterations: 0,
        };

        // Gather model data
        const endpoints = ctx.targetModel.getEndpoints();
        const authClaims = ctx.ledger.getClaimsByType('auth_mechanism');
        const frameworkClaims = ctx.ledger.getClaimsByType('framework');

        // Determine framework
        let detectedFramework = framework;
        if (!detectedFramework && frameworkClaims.length > 0) {
            // Pick highest confidence
            const sorted = frameworkClaims.sort((a, b) =>
                b.getExpectedProbability(ctx.ledger.config) - a.getExpectedProbability(ctx.ledger.config)
            );
            detectedFramework = sorted[0].predicate.framework?.toLowerCase();
        }

        // Default to express
        const scaffold = this.scaffolds[detectedFramework] || this.scaffolds.express;
        results.framework = scaffold.name;

        // Prepare config for templates
        const config = {
            name: new URL(target).hostname.replace(/\./g, '-'),
            target,
            endpoints: await Promise.all(endpoints.map(async e => {
                const enriched = await this.enrichEndpointMetadata(ctx, e);
                return {
                    path: e.attributes.path,
                    method: e.attributes.method,
                    params: e.attributes.params || [],
                    evidence_refs: e.attributes.evidence_refs || [],
                    confidence: e.claim_refs?.length ? 0.7 : 0.5,
                    ...enriched
                };
            })),
            auth: authClaims.length > 0 ? authClaims[0].predicate : null,
            models: this.inferModels(endpoints),
            epistemic: this.aggregateEpistemic(ctx, endpoints),
        };

        // Generate files from scaffold
        const { fs, path } = await import('zx');
        await fs.mkdir(outputDir, { recursive: true });

        for (const [relativePath, templateName] of Object.entries(scaffold.structure)) {
            const template = scaffold.templates[templateName];
            if (!template) continue;

            const content = template(config);
            const filePath = path.join(outputDir, relativePath);

            // Ensure directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });

            // Write file
            await fs.writeFile(filePath, content);

            results.files.push({
                path: filePath,
                template: templateName,
                size: content.length,
            });
        }

        // Validate and repair
        for (let iteration = 0; iteration < this.maxRepairIterations; iteration++) {
            results.repair_iterations = iteration;

            // Validate all generated files
            const validationResults = await this.validateAll(results.files, ctx);

            let allPassed = true;
            for (const vr of validationResults) {
                if (vr.overall) {
                    results.validation.passed++;
                } else {
                    results.validation.failed++;
                    allPassed = false;

                    // Attempt LLM repair
                    if (iteration < this.maxRepairIterations - 1) {
                        const repaired = await this.repairFile(vr, ctx);
                        if (repaired) {
                            await fs.writeFile(vr.file, repaired);
                        }
                    }
                }

                // Emit evidence
                emitValidationEvidence(ctx, vr.file, vr);
            }

            if (allPassed) break;

            // Reset counters for next iteration
            results.validation.passed = 0;
            results.validation.failed = 0;
        }

        // Register artifacts in manifest
        for (const file of results.files) {
            ctx.manifest.addEntry({
                path: file.path,
                generated_from: endpoints.slice(0, 10).map(e => e.id),
                evidence_refs: endpoints.flatMap(e => e.attributes.evidence_refs || []).slice(0, 20),
                epistemic: config.epistemic,
            });
        }

        return results;
    }

    /**
     * Enrich endpoint with semantic data from bodies
     */
    async enrichEndpointMetadata(ctx, endpoint) {
        const metadata = {
            responseExample: null,
            requestSchema: null,
            description: null
        };

        // Find relevant evidence events
        const evidenceRefs = endpoint.attributes.evidence_refs || [];
        for (const refId of evidenceRefs) {
            const event = ctx.evidenceGraph.getEvent(refId);
            if (!event || !event.blob_refs || event.blob_refs.length === 0) continue;

            // Retrieve blobs
            for (const blobId of event.blob_refs) {
                try {
                    const blob = await ctx.evidenceGraph.retrieveBlob(blobId);
                    if (!blob) continue;

                    // Simple heuristic: if it looks like a response body (from browser_xhr)
                    // We assume the first blob is request, second is response if both exist,
                    // or rely on event payload flags if we had them.
                    // For now, let's just try to parse as JSON and use as example
                    try {
                        const json = JSON.parse(blob);
                        // If it has 'data' or is array/object, use as response example
                        if (!metadata.responseExample) {
                            metadata.responseExample = JSON.stringify(json, null, 2);
                        }
                    } catch {
                        // Not JSON
                    }
                } catch {
                    // Blob retrieval failed
                }
            }
        }
        return metadata;
    }

    /**
     * Infer data models from endpoints
     */
    inferModels(endpoints) {
        const models = new Map();

        for (const endpoint of endpoints) {
            const path = endpoint.attributes.path || '';
            const params = endpoint.attributes.params || [];

            // Extract resource name from path
            const segments = path.split('/').filter(s => s && !s.startsWith(':'));
            const resource = segments.find(s => !['api', 'v1', 'v2'].includes(s));

            if (resource && !models.has(resource)) {
                // Infer fields from params
                const fields = {};
                for (const param of params) {
                    if (param.location === 'body' || param.location === 'query') {
                        fields[param.name] = param.type || 'string';
                    }
                }

                if (Object.keys(fields).length > 0) {
                    models.set(resource, {
                        name: resource.charAt(0).toUpperCase() + resource.slice(1),
                        fields,
                    });
                }
            }
        }

        return Array.from(models.values());
    }

    /**
     * Aggregate epistemic info from endpoints
     */
    aggregateEpistemic(ctx, endpoints) {
        let totalBelief = 0;
        let totalUncertainty = 0;
        const uncertainties = [];

        for (const endpoint of endpoints) {
            const claims = ctx.ledger.getClaimsForSubject(endpoint.id);
            for (const claim of claims) {
                const opinion = claim.getOpinion(ctx.ledger.config);
                totalBelief += opinion.b;
                totalUncertainty += opinion.u;

                if (opinion.u > 0.5) {
                    uncertainties.push(`High uncertainty for ${endpoint.attributes.path}`);
                }
            }
        }

        const n = endpoints.length || 1;

        return createEpistemicEnvelope(
            {
                b: totalBelief / n,
                d: 0,
                u: totalUncertainty / n,
                a: 0.5,
            },
            endpoints.flatMap(e => e.claim_refs || []),
            endpoints.flatMap(e => e.attributes.evidence_refs || []),
            uncertainties.slice(0, 10)
        );
    }

    /**
     * Validate all files
     */
    async validateAll(files, ctx) {
        const results = [];

        for (const file of files) {
            const result = await this.validator.validateFile(file.path);
            results.push(result);
        }

        return results;
    }

    /**
     * Attempt to repair a file using LLM
     */
    async repairFile(validationResult, ctx) {
        const { fs } = await import('zx');

        const errors = [
            ...(validationResult.parse?.errors || []),
            ...(validationResult.lint?.errors || []),
        ];

        if (errors.length === 0) return null;

        try {
            const content = await fs.readFile(validationResult.file, 'utf-8');

            ctx.recordTokens(1000);

            const prompt = `Fix the following code errors:

File: ${validationResult.file}
Language: ${validationResult.language}

Current code:
\`\`\`
${content.slice(0, 3000)}
\`\`\`

Errors to fix:
${errors.slice(0, 10).join('\n')}

Return ONLY the fixed code, no explanations.`;

            const response = await this.llm.generate(prompt, {
                capability: LLM_CAPABILITIES.SYNTHESIZE_CODE_PATCH,
                maxTokens: 4000,
            });

            if (response.success) {
                ctx.recordTokens(response.tokens_used);

                // Extract code from response
                let fixed = response.content;
                const codeMatch = fixed.match(/```(?:\w+)?\s*([\s\S]*?)```/);
                if (codeMatch) {
                    fixed = codeMatch[1];
                }

                return fixed.trim();
            }
        } catch {
            // Ignore repair errors
        }

        return null;
    }
}

export default SourceGenAgent;
