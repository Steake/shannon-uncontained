/**
 * SecretScannerAgent - Detect exposed secrets and credentials
 * 
 * Uses trufflehog or gitleaks to scan for exposed API keys,
 * passwords, tokens, and other secrets in discovered content.
 */

import { BaseAgent } from '../base-agent.js';
import { runTool, isToolAvailable } from '../../tools/runners/tool-runner.js';
import { fs, path } from 'zx';

export class SecretScannerAgent extends BaseAgent {
    constructor(options = {}) {
        super('SecretScannerAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['sourceDir'],
            properties: {
                sourceDir: {
                    type: 'string',
                    description: 'Directory containing files to scan'
                },
                target: {
                    type: 'string',
                    description: 'Target URL (for JS file scanning)'
                },
                tool: {
                    type: 'string',
                    enum: ['trufflehog', 'gitleaks', 'auto'],
                    default: 'auto'
                },
                scanJs: {
                    type: 'boolean',
                    default: true,
                    description: 'Scan discovered JS files for secrets'
                }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                secrets: { type: 'array' },
                summary: { type: 'object' },
                tool: { type: 'string' }
            }
        };

        this.requires = {
            evidence_kinds: ['js_file_discovered', 'file_content'],
            model_nodes: ['files', 'endpoints']
        };

        this.emits = {
            evidence_events: ['secret_detected', 'api_key_exposed', 'credential_found'],
            model_updates: ['secret_location'],
            claims: ['credential_exposed', 'api_key_leaked', 'private_key_exposed'],
            artifacts: ['secret_scan_results.json']
        };

        this.default_budget = {
            max_time_ms: 180000,
            max_network_requests: 0,
            max_tokens: 0,
            max_tool_invocations: 2
        };

        // Regex patterns for common secrets (used as fallback)
        this.secretPatterns = [
            { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
            { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g, severity: 'critical' },
            { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, severity: 'critical' },
            { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36}/g, severity: 'high' },
            { name: 'Slack Token', pattern: /xox[baprs]-[0-9]+-[0-9]+-[A-Za-z0-9]+/g, severity: 'high' },
            { name: 'Stripe Key', pattern: /sk_live_[A-Za-z0-9]{24}/g, severity: 'critical' },
            { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'high' },
            { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, severity: 'medium' },
            { name: 'Generic Password', pattern: /(?:password|passwd|pwd|secret)\s*[=:]\s*['"]?[A-Za-z0-9!@#$%^&*()_+\-=]{8,}['"]?/gi, severity: 'medium' },
            { name: 'Database URL', pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^\s"']+/gi, severity: 'high' },
            { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, severity: 'high' },
        ];
    }

    /**
     * Detect available tool
     */
    async detectTool() {
        if (await isToolAvailable('trufflehog')) return 'trufflehog';
        if (await isToolAvailable('gitleaks')) return 'gitleaks';
        return null;
    }

    /**
     * Scan with trufflehog
     */
    async scanWithTrufflehog(sourceDir) {
        const cmd = `trufflehog filesystem "${sourceDir}" --json --no-update`;
        const result = await runTool(cmd, { timeout: 180000 });

        const secrets = [];
        const lines = (result.stdout || '').split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const finding = JSON.parse(line);
                secrets.push({
                    type: finding.DetectorName || finding.detectorName,
                    severity: this.mapSeverity(finding.DetectorName),
                    file: finding.SourceMetadata?.Data?.Filesystem?.file || 'unknown',
                    line: finding.SourceMetadata?.Data?.Filesystem?.line,
                    raw: finding.Raw?.substring(0, 50) + '...',  // Truncate for safety
                    verified: finding.Verified || false
                });
            } catch { }
        }

        return secrets;
    }

    /**
     * Scan with gitleaks
     */
    async scanWithGitleaks(sourceDir) {
        const cmd = `gitleaks detect --source "${sourceDir}" --report-format json --report-path /dev/stdout --no-git`;
        const result = await runTool(cmd, { timeout: 180000 });

        const secrets = [];

        try {
            const findings = JSON.parse(result.stdout || '[]');
            for (const finding of findings) {
                secrets.push({
                    type: finding.RuleID || finding.Description,
                    severity: this.mapSeverity(finding.RuleID),
                    file: finding.File,
                    line: finding.StartLine,
                    raw: finding.Secret?.substring(0, 50) + '...',
                    match: finding.Match
                });
            }
        } catch { }

        return secrets;
    }

    /**
     * Fallback regex scanning
     */
    async scanWithRegex(sourceDir) {
        const secrets = [];

        // Get all text files
        const files = await this.getTextFiles(sourceDir);

        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');

                for (const { name, pattern, severity } of this.secretPatterns) {
                    const matches = content.matchAll(pattern);
                    for (const match of matches) {
                        secrets.push({
                            type: name,
                            severity,
                            file: path.relative(sourceDir, file),
                            raw: match[0].substring(0, 50) + '...',
                            method: 'regex'
                        });
                    }
                }
            } catch { }
        }

        return secrets;
    }

    /**
     * Get text files in directory
     */
    async getTextFiles(dir) {
        const files = [];
        const extensions = ['.js', '.json', '.txt', '.env', '.yml', '.yaml', '.xml', '.conf', '.cfg', '.pseudo.js'];

        const walk = async (currentDir) => {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    if (extensions.some(ext => entry.name.endsWith(ext))) {
                        files.push(fullPath);
                    }
                }
            }
        };

        await walk(dir);
        return files;
    }

    /**
     * Map detector to severity
     */
    mapSeverity(detector) {
        const critical = ['AWS', 'PrivateKey', 'RSA', 'Stripe', 'Database'];
        const high = ['GitHub', 'GitLab', 'Slack', 'Google', 'Azure', 'API'];

        const d = (detector || '').toLowerCase();

        if (critical.some(c => d.includes(c.toLowerCase()))) return 'critical';
        if (high.some(h => d.includes(h.toLowerCase()))) return 'high';
        return 'medium';
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        const { sourceDir, tool = 'auto', scanJs = true } = inputs;

        // Detect tool
        let selectedTool = tool;
        if (tool === 'auto') {
            selectedTool = await this.detectTool();
        }

        ctx.recordToolInvocation();

        let secrets = [];

        if (selectedTool === 'trufflehog') {
            secrets = await this.scanWithTrufflehog(sourceDir);
        } else if (selectedTool === 'gitleaks') {
            secrets = await this.scanWithGitleaks(sourceDir);
        } else {
            // Fallback to regex
            secrets = await this.scanWithRegex(sourceDir);
            selectedTool = 'regex_fallback';
        }

        // Deduplicate
        const seen = new Set();
        secrets = secrets.filter(s => {
            const key = `${s.type}:${s.file}:${s.raw}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Build summary
        const summary = {
            total: secrets.length,
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            byType: {}
        };

        for (const secret of secrets) {
            // Count by severity
            summary.bySeverity[secret.severity] = (summary.bySeverity[secret.severity] || 0) + 1;

            // Count by type
            summary.byType[secret.type] = (summary.byType[secret.type] || 0) + 1;

            // Emit evidence
            const evidenceId = ctx.emitEvidence({
                type: secret.severity === 'critical' ? 'credential_found' : 'secret_detected',
                source: this.name,
                data: {
                    type: secret.type,
                    severity: secret.severity,
                    file: secret.file,
                    line: secret.line
                }
            });

            // Emit claim
            const claimType = secret.type.toLowerCase().includes('key') ? 'api_key_leaked' :
                secret.type.toLowerCase().includes('private') ? 'private_key_exposed' :
                    'credential_exposed';

            ctx.emitClaim({
                claim_type: claimType,
                subject: secret.file,
                predicate: {
                    secretType: secret.type,
                    severity: secret.severity
                },
                base_rate: 0.05  // Secrets are relatively rare but critical
            });

            // Add EBSL evidence
            const weight = secret.severity === 'critical' ? 1.0 :
                secret.severity === 'high' ? 0.9 : 0.7;

            ctx.ledger.addEvidence(
                ctx.ledger.generateClaimId(claimType, secret.file),
                'active_probe_success',
                weight,
                this.name,
                evidenceId
            );
        }

        return {
            secrets,
            tool: selectedTool,
            summary
        };
    }
}

export default SecretScannerAgent;
