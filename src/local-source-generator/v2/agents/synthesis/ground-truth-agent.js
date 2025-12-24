/**
 * GroundTruthAgent - Validates synthetic source against live HTTP responses
 * 
 * Part of the closed-loop validation system that prevents false positives
 * by probing generated endpoints and annotating pseudo-code with observed behavior.
 */

import { BaseAgent } from '../base-agent.js';
import { probeEndpoints, classifyBehavior } from '../../tools/probers/endpoint-prober.js';
import { fs, path } from 'zx';

export class GroundTruthAgent extends BaseAgent {
    constructor() {
        super('GroundTruthAgent');

        this.inputs_schema = {
            type: 'object',
            required: ['webUrl', 'sourceDir'],
            properties: {
                webUrl: { type: 'string', format: 'uri' },
                sourceDir: { type: 'string' },
                concurrency: { type: 'number', default: 3 },
                delay: { type: 'number', default: 500 }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                validated: { type: 'boolean' },
                summary: { type: 'object' },
                probeResults: { type: 'array' },
                falsePositiveLikely: { type: 'number' }
            }
        };

        this.requires = {
            evidence_kinds: ['route_discovered', 'endpoint_inferred'],
            model_nodes: ['routes', 'endpoints']
        };

        this.emits = {
            evidence_events: ['ground_truth_probed'],
            model_updates: ['endpoint_validation'],
            claims: ['endpoint_accessible', 'endpoint_protected', 'endpoint_nonexistent'],
            artifacts: ['ground_truth_validation.json']
        };

        this.default_budget = {
            max_time_ms: 120000,          // 2 minutes
            max_network_requests: 500,     // Up to 500 probes
            max_tokens: 0,                 // No LLM usage
            max_tool_invocations: 0        // No tool usage
        };
    }

    /**
     * Extract routes from generated pseudo-code files
     */
    async extractRoutes(sourceDir) {
        const routesDir = path.join(sourceDir, 'routes');
        const routes = [];

        if (!await fs.pathExists(routesDir)) {
            return routes;
        }

        const files = await fs.readdir(routesDir);

        for (const file of files) {
            if (!file.endsWith('.pseudo.js')) continue;

            const filePath = path.join(routesDir, file);
            const content = await fs.readFile(filePath, 'utf8');

            // Extract route definitions
            const routePatterns = [
                /\/\/\s*Route:\s*(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/gi,
                /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi
            ];

            for (const pattern of routePatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    routes.push({
                        method: match[1].toUpperCase(),
                        path: match[2],
                        file,
                        filePath
                    });
                }
            }
        }

        // Deduplicate
        const seen = new Set();
        return routes.filter(r => {
            const key = `${r.method}:${r.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Annotate pseudo-code with ground-truth results
     */
    async annotateCode(filePath, results) {
        let content = await fs.readFile(filePath, 'utf8');

        // Build annotation header
        const header = [
            '',
            '// ═══════════════════════════════════════════════════════════════',
            '// [GROUND-TRUTH] Validated against live server',
            '// ═══════════════════════════════════════════════════════════════'
        ];

        for (const result of results) {
            const behavior = classifyBehavior(result);
            header.push(`// ${result.method} ${new URL(result.url).pathname}`);
            header.push(`//   └─ ${result.status} ${behavior.classification} | Auth: ${behavior.authRequired}`);
        }

        header.push('// ═══════════════════════════════════════════════════════════════');
        header.push('');

        // Insert after first comment block
        const firstNewline = content.indexOf('\n\n');
        if (firstNewline > 0) {
            content = content.slice(0, firstNewline) + header.join('\n') + content.slice(firstNewline);
        } else {
            content = header.join('\n') + content;
        }

        await fs.writeFile(filePath, content);
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        // Fix: inputs.outputDir contains the generated source, inputs.sourceDir might be undefined
        const { webUrl, concurrency = 3, delay = 500 } = inputs;
        const sourceDir = inputs.sourceDir || inputs.outputDir;

        // Extract routes from pseudo-code
        const routes = await this.extractRoutes(sourceDir);

        if (routes.length === 0) {
            return {
                validated: false,
                reason: 'No routes found in pseudo-code',
                summary: { total: 0 },
                probeResults: [],
                falsePositiveLikely: 0
            };
        }

        // Build endpoint URLs
        const baseUrl = webUrl.replace(/\/$/, '');
        const endpoints = routes.map(r => ({
            url: `${baseUrl}${r.path}`,
            method: r.method,
            route: r
        }));

        // Probe endpoints
        const probeResults = await probeEndpoints(endpoints, { concurrency, delay });

        // Track network requests for budgeting
        for (let i = 0; i < probeResults.length; i++) {
            ctx.recordNetworkRequest();
        }

        // Classify and emit evidence
        const summary = {
            total: probeResults.length,
            accessible: 0,
            protected: 0,
            notFound: 0,
            redirect: 0,
            error: 0,
            unknown: 0,
            falsePositiveLikely: 0
        };

        // Group by file for annotation
        const resultsByFile = {};

        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const result = probeResults[i];
            const behavior = classifyBehavior(result);

            // Update summary
            switch (behavior.classification) {
                case 'ACCESSIBLE': summary.accessible++; break;
                case 'PROTECTED':
                    summary.protected++;
                    summary.falsePositiveLikely++;
                    break;
                case 'NOT_FOUND':
                    summary.notFound++;
                    summary.falsePositiveLikely++;
                    break;
                case 'REDIRECT': summary.redirect++; break;
                case 'ERROR': summary.error++; break;
                default: summary.unknown++;
            }

            // Emit evidence event
            ctx.emitEvidence({
                type: 'ground_truth_probed',
                source: this.name,
                data: {
                    route: route.path,
                    method: route.method,
                    status: result.status,
                    classification: behavior.classification,
                    authRequired: behavior.authRequired
                }
            });

            // Emit claim
            const claimType = {
                'ACCESSIBLE': 'endpoint_accessible',
                'PROTECTED': 'endpoint_protected',
                'NOT_FOUND': 'endpoint_nonexistent'
            }[behavior.classification];

            if (claimType) {
                ctx.emitClaim({
                    type: claimType,
                    subject: route.path,
                    confidence: result.status ? 0.95 : 0.5,
                    evidence: [result]
                });
            }

            // Group for file annotation
            if (!resultsByFile[route.filePath]) {
                resultsByFile[route.filePath] = [];
            }
            resultsByFile[route.filePath].push(result);
        }

        // Annotate pseudo-code files
        for (const [filePath, results] of Object.entries(resultsByFile)) {
            await this.annotateCode(filePath, results);
        }

        // Save validation report
        const reportPath = path.join(sourceDir, 'deliverables', 'ground_truth_validation.json');
        await fs.ensureDir(path.dirname(reportPath));
        await fs.writeFile(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            webUrl,
            summary,
            probeResults: probeResults.map((r, i) => ({
                ...r,
                route: routes[i].path,
                method: routes[i].method,
                behavior: classifyBehavior(r)
            }))
        }, null, 2));

        return {
            validated: true,
            summary,
            probeResults,
            falsePositiveLikely: summary.falsePositiveLikely,
            reportPath
        };
    }
}

export default GroundTruthAgent;
