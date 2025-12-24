/**
 * BlackboxConfigGenAgent - Generates standard blackbox config from discovered intelligence
 * 
 * Transforms the World Model (TargetModel) into a portable YAML configuration
 * that can be used to replay the scan with specific settings or configure
 * other black-box tools.
 */

import { BaseAgent } from '../base-agent.js';
import { fs, path } from 'zx';
import yaml from 'js-yaml';

export class BlackboxConfigGenAgent extends BaseAgent {
    constructor() {
        super('BlackboxConfigGenAgent');

        this.inputs_schema = {
            type: 'object',
            required: ['target', 'outputDir'],
            properties: {
                target: { type: 'string', format: 'uri' },
                outputDir: { type: 'string' }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                configPath: { type: 'string' },
                config: { type: 'object' }
            }
        };

        this.requires = {
            evidence_kinds: [], // Uses TargetModel directly
            model_nodes: ['endpoints', 'auth_context']
        };

        this.emits = {
            evidence_events: [],
            model_updates: [],
            claims: [],
            artifacts: ['blackbox-config.yaml']
        };

        this.default_budget = {
            max_time_ms: 5000,
            max_network_requests: 0,
            max_tokens: 0,
            max_tool_invocations: 0
        };
    }

    async run(ctx, inputs) {
        const { target, outputDir } = inputs;
        const model = ctx.targetModel;

        // 1. Base Configuration
        const config = {
            mode: 'black-box',
            target: target,
            generated_at: new Date().toISOString(),
            reconnaissance: {
                aggressive_crawling: true,
                javascript_analysis: true,
                api_schema_discovery: true,
                max_depth: 3,
                timeout: 30
            },
            authentication: null, // Populated below
            rules: {
                avoid: [],
                focus: []
            }
        };

        // 2. Derive Authentication
        // Look for auth context in target model or specific evidence
        // Since AuthFlowAnalyzer isn't fully populating the model with standard nodes yet,
        // we'll look for evidence of login endpoints.

        const endpoints = model.getEntitiesByType('endpoint');
        const loginEndpoints = endpoints.filter(e =>
            e.attributes.path?.toLowerCase().includes('login') ||
            e.attributes.path?.toLowerCase().includes('signin')
        );

        if (loginEndpoints.length > 0) {
            // Pick the most likely login URL
            const bestLogin = loginEndpoints[0]; // Naive selection for now

            config.authentication = {
                login_type: 'form', // Default assumption
                login_url: `${target.replace(/\/$/, '')}${bestLogin.attributes.path}`,
                credentials: {
                    username: '{{username}}', // Placeholder
                    password: '{{password}}'  // Placeholder
                },
                login_flow: [
                    "Type $username into the email field",
                    "Type $password into the password field",
                    "Click the 'Sign In' button"
                ],
                success_condition: {
                    type: 'url_contains',
                    value: '/dashboard' // Heuristic assumption
                }
            };
        }

        // 3. Generate Rules

        // Avoid: Logout endpoints
        const logoutEndpoints = endpoints.filter(e =>
            e.attributes.path?.toLowerCase().includes('logout') ||
            e.attributes.path?.toLowerCase().includes('signout')
        );

        for (const ep of logoutEndpoints) {
            config.rules.avoid.push({
                description: "Avoid logout to maintain session",
                type: "path",
                url_path: ep.attributes.path
            });
        }

        // Focus: API endpoints
        const apiEndpoints = endpoints.filter(e =>
            e.attributes.path?.toLowerCase().includes('/api') ||
            e.attributes.path?.toLowerCase().includes('/v1')
        );

        if (apiEndpoints.length > 0) {
            config.rules.focus.push({
                description: "Prioritize API endpoints",
                type: "path_prefix",
                url_path: "/api"
            });
        }

        // 4. Tech Stack Adjustments (Heuristic)
        // If we found specific tech, we might tune recon settings
        // (Placeholder for future logic using tech_fingerprint evidence)

        // 5. Write Artifact
        const deliverablesDir = path.join(outputDir, 'deliverables');
        await fs.ensureDir(deliverablesDir);

        const configPath = path.join(deliverablesDir, 'blackbox-config.yaml');
        const yamlStr = yaml.dump(config, { indent: 2, lineWidth: -1 });

        await fs.writeFile(configPath, yamlStr);

        return {
            configPath,
            config
        };
    }
}

export default BlackboxConfigGenAgent;
