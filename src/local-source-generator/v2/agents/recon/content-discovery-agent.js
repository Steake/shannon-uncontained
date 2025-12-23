/**
 * ContentDiscoveryAgent - Hidden content and directory discovery
 * 
 * Uses feroxbuster or ffuf for brute-force discovery of hidden
 * files, directories, and backup files not found by crawling.
 */

import { BaseAgent } from '../base-agent.js';
import { runTool, isToolAvailable } from '../../tools/runners/tool-runner.js';

export class ContentDiscoveryAgent extends BaseAgent {
    constructor(options = {}) {
        super('ContentDiscoveryAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL to scan' },
                wordlist: {
                    type: 'string',
                    default: '/usr/share/seclists/Discovery/Web-Content/common.txt',
                    description: 'Path to wordlist file'
                },
                extensions: {
                    type: 'array',
                    items: { type: 'string' },
                    default: ['php', 'bak', 'old', 'txt', 'conf', 'json', 'xml', 'env'],
                    description: 'File extensions to test'
                },
                threads: {
                    type: 'number',
                    default: 50,
                    description: 'Number of concurrent requests'
                },
                recursionDepth: {
                    type: 'number',
                    default: 2,
                    description: 'Maximum recursion depth'
                },
                tool: {
                    type: 'string',
                    enum: ['feroxbuster', 'ffuf', 'auto'],
                    default: 'auto',
                    description: 'Tool to use for discovery'
                }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                discovered: { type: 'array' },
                summary: { type: 'object' },
                tool: { type: 'string' }
            }
        };

        this.requires = {
            evidence_kinds: ['endpoint_discovered'],
            model_nodes: ['endpoints']
        };

        this.emits = {
            evidence_events: ['hidden_path_discovered', 'backup_file_found', 'config_exposed'],
            model_updates: ['endpoint_added'],
            claims: ['sensitive_file_exposed', 'backup_accessible', 'directory_listing'],
            artifacts: ['content_discovery_results.json']
        };

        this.default_budget = {
            max_time_ms: 300000,
            max_network_requests: 10000,
            max_tokens: 0,
            max_tool_invocations: 1
        };

        // Interesting paths patterns
        this.sensitivePatterns = [
            /\.git/i,
            /\.env/i,
            /\.htaccess/i,
            /\.htpasswd/i,
            /backup/i,
            /admin/i,
            /config/i,
            /database/i,
            /\.sql/i,
            /\.bak/i,
            /\.old/i,
            /\.swp/i,
            /\.log/i,
            /phpinfo/i,
            /\.DS_Store/i,
            /web\.config/i,
            /wp-config/i,
        ];
    }

    /**
     * Detect which tool is available
     */
    async detectTool() {
        if (await isToolAvailable('feroxbuster')) {
            return 'feroxbuster';
        }
        if (await isToolAvailable('ffuf')) {
            return 'ffuf';
        }
        return null;
    }

    /**
     * Build feroxbuster command
     */
    buildFeroxbusterCommand(inputs) {
        const { target, wordlist, extensions, threads, recursionDepth } = inputs;

        let cmd = `feroxbuster -u "${target}" -w "${wordlist}"`;
        cmd += ` -t ${threads}`;
        cmd += ` -d ${recursionDepth}`;
        cmd += ` -x ${extensions.join(',')}`;
        cmd += ' --json';
        cmd += ' -q';  // Quiet mode
        cmd += ' --no-state';

        return cmd;
    }

    /**
     * Build ffuf command
     */
    buildFfufCommand(inputs) {
        const { target, wordlist, extensions, threads } = inputs;

        // Ensure target has FUZZ keyword
        const fuzzTarget = target.endsWith('/') ? `${target}FUZZ` : `${target}/FUZZ`;

        let cmd = `ffuf -u "${fuzzTarget}" -w "${wordlist}"`;
        cmd += ` -t ${threads}`;
        cmd += ` -e ${extensions.map(e => `.${e}`).join(',')}`;
        cmd += ' -o /dev/stdout -of json';
        cmd += ' -s';  // Silent mode
        cmd += ' -mc 200,201,204,301,302,307,401,403';  // Match codes

        return cmd;
    }

    /**
     * Parse feroxbuster JSON output
     */
    parseFeroxbusterOutput(stdout) {
        const discovered = [];
        const lines = stdout.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'response' && entry.status) {
                    discovered.push({
                        url: entry.url,
                        path: new URL(entry.url).pathname,
                        status: entry.status,
                        size: entry.content_length || entry.word_count,
                        method: 'GET'
                    });
                }
            } catch { }
        }

        return discovered;
    }

    /**
     * Parse ffuf JSON output
     */
    parseFfufOutput(stdout) {
        const discovered = [];

        try {
            const data = JSON.parse(stdout);
            for (const result of data.results || []) {
                discovered.push({
                    url: result.url,
                    path: new URL(result.url).pathname,
                    status: result.status,
                    size: result.length,
                    words: result.words,
                    lines: result.lines
                });
            }
        } catch { }

        return discovered;
    }

    /**
     * Classify discovered path
     */
    classifyPath(path) {
        const classifications = [];

        for (const pattern of this.sensitivePatterns) {
            if (pattern.test(path)) {
                if (/\.git/i.test(path)) classifications.push('git_exposed');
                else if (/\.env/i.test(path)) classifications.push('env_exposed');
                else if (/backup|\.bak|\.old/i.test(path)) classifications.push('backup_file');
                else if (/config|\.conf/i.test(path)) classifications.push('config_exposed');
                else if (/admin/i.test(path)) classifications.push('admin_panel');
                else if (/\.sql/i.test(path)) classifications.push('database_file');
                else if (/\.log/i.test(path)) classifications.push('log_exposed');
                else classifications.push('sensitive_file');
            }
        }

        return classifications.length > 0 ? classifications : ['discovered'];
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        const {
            target,
            wordlist = '/usr/share/seclists/Discovery/Web-Content/common.txt',
            extensions = ['php', 'bak', 'old', 'txt', 'conf', 'json', 'xml', 'env'],
            threads = 50,
            recursionDepth = 2,
            tool = 'auto'
        } = inputs;

        // Detect tool
        let selectedTool = tool;
        if (tool === 'auto') {
            selectedTool = await this.detectTool();
        }

        if (!selectedTool) {
            return {
                discovered: [],
                error: 'No content discovery tool available. Install feroxbuster or ffuf.',
                tool: null,
                summary: { total: 0 }
            };
        }

        // Build command
        const command = selectedTool === 'feroxbuster'
            ? this.buildFeroxbusterCommand({ target, wordlist, extensions, threads, recursionDepth })
            : this.buildFfufCommand({ target, wordlist, extensions, threads });

        ctx.recordToolInvocation();
        const result = await runTool(command, { timeout: 300000 });

        // Parse output
        const discovered = selectedTool === 'feroxbuster'
            ? this.parseFeroxbusterOutput(result.stdout || '')
            : this.parseFfufOutput(result.stdout || '');

        // Process and emit evidence for each discovery
        const summary = {
            total: discovered.length,
            byStatus: {},
            byClassification: {},
            sensitive: 0
        };

        for (const item of discovered) {
            ctx.recordNetworkRequest();

            const classifications = this.classifyPath(item.path);
            item.classifications = classifications;

            // Count by status
            summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1;

            // Count by classification
            for (const cls of classifications) {
                summary.byClassification[cls] = (summary.byClassification[cls] || 0) + 1;
            }

            // Detect sensitive files
            const isSensitive = classifications.some(c => c !== 'discovered');
            if (isSensitive) {
                summary.sensitive++;

                // Emit evidence
                const evidenceId = ctx.emitEvidence({
                    type: classifications.includes('backup_file') ? 'backup_file_found' :
                        classifications.includes('config_exposed') ? 'config_exposed' :
                            'hidden_path_discovered',
                    source: this.name,
                    data: item
                });

                // Emit claim
                ctx.emitClaim({
                    claim_type: 'sensitive_file_exposed',
                    subject: item.url,
                    predicate: {
                        path: item.path,
                        status: item.status,
                        classifications
                    },
                    base_rate: 0.2
                });

                // Add EBSL evidence
                ctx.ledger.addEvidence(
                    ctx.ledger.generateClaimId('sensitive_file_exposed', item.url),
                    'active_probe_success',
                    0.9,
                    this.name,
                    evidenceId
                );
            }
        }

        return {
            discovered,
            tool: selectedTool,
            summary
        };
    }
}

export default ContentDiscoveryAgent;
