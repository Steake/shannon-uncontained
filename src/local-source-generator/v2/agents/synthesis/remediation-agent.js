/**
 * RemediationAgent - Patch Generator
 * 
 * Generates git-compatible patches for confirmed vulnerabilities.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class RemediationAgent extends BaseAgent {
    constructor(options = {}) {
        super('RemediationAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['vulnerability_claim'],
            properties: {
                vulnerability_claim: { type: 'object' },
                source_code: { type: 'string' },
                file_path: { type: 'string' }
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                patch: { type: 'string' },
                explanation: { type: 'string' },
                verification_steps: { type: 'array' }
            },
        };

        this.emits = {
            evidence_events: ['patch_generated'],
            model_updates: [],
            claims: [CLAIM_TYPES.REMEDIATION],
        };

        this.llm = getLLMClient();
    }

    async run(ctx, inputs) {
        const { vulnerability_claim, source_code, file_path } = inputs;

        ctx.log(`Generating patch for ${vulnerability_claim.subject} in ${file_path}`);

        const prompt = `You are a Senior Security Engineer. Fixing a confirmed vulnerability.

VULNERABILITY: ${vulnerability_claim.subject}
DETAILS: ${JSON.stringify(vulnerability_claim.predicate)}
FILE: ${file_path}

SOURCE CODE:
\`\`\`javascript
${source_code}
\`\`\`

TASK:
1. Identify the insecure code block.
2. Generate a secure replacement using best practices (e.g., parameterized queries, input validation).
3. Create a unified diff patch.

RESPONSE FORMAT:
JSON with fields:
- patch: The full unified diff string
- explanation: Why this fixes the issue
- verification_steps: How to verify the fix`;

        const response = await this.llm.generateStructured(prompt, this.getOutputSchema(), {
            capability: LLM_CAPABILITIES.CODE_GENERATION,
            temperature: 0.1
        });

        if (response.success && response.data) {

            // Validate patch format (basic check)
            if (!response.data.patch.startsWith('---') && !response.data.patch.startsWith('@@')) {
                ctx.log('Warning: Generated patch may be malformed');
            }

            // Emit claim that remediation exists
            ctx.emitClaim({
                claim_type: CLAIM_TYPES.REMEDIATION,
                subject: vulnerability_claim.subject,
                predicate: {
                    patch: response.data.patch,
                    file: file_path
                },
                base_rate: 0.9
            });

            return response.data;
        }

        return null;
    }
}

export default RemediationAgent;
