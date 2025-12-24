/**
 * TLSAnalyzer - TLS/SSL configuration analysis
 * 
 * Analyzes TLS configuration for weak ciphers, expired certs,
 * and protocol vulnerabilities using sslyze or manual checks.
 */

import { BaseAgent } from '../base-agent.js';
import { runTool, isToolAvailable } from '../../tools/runners/tool-runner.js';

export class TLSAnalyzer extends BaseAgent {
    constructor(options = {}) {
        super('TLSAnalyzer', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target host (domain or IP)' },
                port: { type: 'number', default: 443 }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                certificate: { type: 'object' },
                protocols: { type: 'object' },
                ciphers: { type: 'object' },
                vulnerabilities: { type: 'array' },
                score: { type: 'number' }
            }
        };

        this.requires = {
            evidence_kinds: ['service_detected'],
            model_nodes: ['services']
        };

        this.emits = {
            evidence_events: ['weak_cipher_detected', 'expired_cert', 'tls_vulnerability'],
            model_updates: ['tls_config'],
            claims: ['weak_tls_config', 'expired_certificate', 'vulnerable_protocol'],
            artifacts: ['tls_analysis_report.json']
        };

        this.default_budget = {
            max_time_ms: 120000,
            max_network_requests: 10,
            max_tokens: 0,
            max_tool_invocations: 1
        };

        // Weak/deprecated protocols
        this.deprecatedProtocols = ['SSLv2', 'SSLv3', 'TLSv1.0', 'TLSv1.1'];

        // Weak cipher patterns
        this.weakCipherPatterns = [
            /RC4/i,
            /DES(?!-CBC3)/i,
            /MD5/i,
            /NULL/i,
            /EXPORT/i,
            /anon/i,
            /CBC.*SHA$/i,  // CBC mode with SHA-1
        ];
    }

    /**
     * Run sslyze scan
     */
    async runSslyze(target, port = 443) {
        const cmd = `sslyze ${target}:${port} --json_out=/dev/stdout`;
        const result = await runTool(cmd, { timeout: 120000 });

        try {
            return JSON.parse(result.stdout);
        } catch {
            return null;
        }
    }

    /**
     * Manual TLS check using Node's tls module
     */
    async manualTLSCheck(target, port = 443) {
        const tls = await import('tls');
        const net = await import('net');

        return new Promise((resolve) => {
            const socket = tls.connect({
                host: target,
                port,
                rejectUnauthorized: false,
                servername: target
            }, () => {
                const cert = socket.getPeerCertificate();
                const protocol = socket.getProtocol();
                const cipher = socket.getCipher();

                const result = {
                    certificate: {
                        subject: cert.subject,
                        issuer: cert.issuer,
                        valid_from: cert.valid_from,
                        valid_to: cert.valid_to,
                        fingerprint: cert.fingerprint,
                        serialNumber: cert.serialNumber
                    },
                    protocol,
                    cipher: cipher ? {
                        name: cipher.name,
                        version: cipher.version
                    } : null,
                    authorized: socket.authorized,
                    authorizationError: socket.authorizationError
                };

                socket.end();
                resolve(result);
            });

            socket.on('error', (err) => {
                resolve({ error: err.message });
            });

            socket.setTimeout(30000, () => {
                socket.destroy();
                resolve({ error: 'Connection timeout' });
            });
        });
    }

    /**
     * Parse sslyze results
     */
    parseSslyzeResults(data) {
        const results = {
            certificate: {},
            protocols: {},
            ciphers: { accepted: [], rejected: [], weak: [] },
            vulnerabilities: []
        };

        if (!data?.server_scan_results?.[0]) {
            return null;
        }

        const scan = data.server_scan_results[0];
        const commands = scan.scan_commands_results;

        // Certificate info
        if (commands?.certificate_info) {
            const certInfo = commands.certificate_info;
            const cert = certInfo.certificate_deployments?.[0]?.received_certificate_chain?.[0];

            if (cert) {
                results.certificate = {
                    subject: cert.subject?.rfc4514_string,
                    issuer: cert.issuer?.rfc4514_string,
                    not_before: cert.not_valid_before,
                    not_after: cert.not_valid_after,
                    serial_number: cert.serial_number,
                    signature_algorithm: cert.signature_algorithm_oid
                };

                // Check expiry
                const expiryDate = new Date(cert.not_valid_after);
                if (expiryDate < new Date()) {
                    results.vulnerabilities.push({
                        type: 'expired_certificate',
                        severity: 'critical',
                        description: `Certificate expired on ${cert.not_valid_after}`
                    });
                } else if (expiryDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
                    results.vulnerabilities.push({
                        type: 'expiring_soon',
                        severity: 'medium',
                        description: `Certificate expires in less than 30 days`
                    });
                }
            }
        }

        // Protocol support
        const protocols = ['ssl_2_0', 'ssl_3_0', 'tls_1_0', 'tls_1_1', 'tls_1_2', 'tls_1_3'];
        for (const proto of protocols) {
            if (commands?.[`${proto}_cipher_suites`]) {
                const protoResult = commands[`${proto}_cipher_suites`];
                const isSupported = protoResult.accepted_cipher_suites?.length > 0;

                results.protocols[proto] = isSupported;

                // Flag deprecated protocols
                if (isSupported && ['ssl_2_0', 'ssl_3_0', 'tls_1_0', 'tls_1_1'].includes(proto)) {
                    results.vulnerabilities.push({
                        type: 'deprecated_protocol',
                        severity: proto.includes('ssl') ? 'critical' : 'high',
                        description: `Deprecated protocol ${proto.replace('_', '.').toUpperCase()} is enabled`
                    });
                }

                // Check ciphers
                if (protoResult.accepted_cipher_suites) {
                    for (const cipher of protoResult.accepted_cipher_suites) {
                        const cipherName = cipher.cipher_suite?.name || cipher.name;
                        results.ciphers.accepted.push(cipherName);

                        // Check for weak ciphers
                        for (const pattern of this.weakCipherPatterns) {
                            if (pattern.test(cipherName)) {
                                results.ciphers.weak.push(cipherName);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Add weak cipher vulnerabilities
        if (results.ciphers.weak.length > 0) {
            results.vulnerabilities.push({
                type: 'weak_ciphers',
                severity: 'high',
                description: `${results.ciphers.weak.length} weak cipher suites enabled`,
                ciphers: results.ciphers.weak
            });
        }

        // Check for specific vulnerabilities
        if (commands?.heartbleed) {
            if (commands.heartbleed.is_vulnerable_to_heartbleed) {
                results.vulnerabilities.push({
                    type: 'heartbleed',
                    severity: 'critical',
                    description: 'Server is vulnerable to Heartbleed (CVE-2014-0160)'
                });
            }
        }

        if (commands?.robot) {
            if (commands.robot.robot_result !== 'NOT_VULNERABLE') {
                results.vulnerabilities.push({
                    type: 'robot',
                    severity: 'high',
                    description: 'Server may be vulnerable to ROBOT attack'
                });
            }
        }

        return results;
    }

    /**
     * Calculate TLS security score
     */
    calculateScore(analysis) {
        let score = 100;

        for (const vuln of analysis.vulnerabilities) {
            if (vuln.severity === 'critical') score -= 30;
            else if (vuln.severity === 'high') score -= 20;
            else if (vuln.severity === 'medium') score -= 10;
            else score -= 5;
        }

        // Bonus for TLS 1.3 support
        if (analysis.protocols?.tls_1_3) score += 5;

        // Penalty for no TLS 1.2
        if (!analysis.protocols?.tls_1_2 && !analysis.protocols?.tls_1_3) {
            score -= 20;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        const { target, port = 443 } = inputs;

        // Extract hostname from URL if needed
        let hostname = target;
        try {
            const url = new URL(target);
            hostname = url.hostname;
        } catch { }

        let analysis = null;
        let tool = 'manual';

        // Try sslyze first
        if (await isToolAvailable('sslyze')) {
            ctx.recordToolInvocation();
            const sslyzeResult = await this.runSslyze(hostname, port);
            if (sslyzeResult) {
                analysis = this.parseSslyzeResults(sslyzeResult);
                tool = 'sslyze';
            }
        }

        // Fallback to manual check
        if (!analysis) {
            ctx.recordNetworkRequest();
            const manualResult = await this.manualTLSCheck(hostname, port);

            if (manualResult.error) {
                return {
                    error: manualResult.error,
                    certificate: {},
                    protocols: {},
                    vulnerabilities: [],
                    score: 0
                };
            }

            analysis = {
                certificate: manualResult.certificate,
                protocols: { [manualResult.protocol]: true },
                ciphers: { accepted: [manualResult.cipher?.name], weak: [] },
                vulnerabilities: []
            };

            // Check cert expiry
            if (manualResult.certificate?.valid_to) {
                const expiryDate = new Date(manualResult.certificate.valid_to);
                if (expiryDate < new Date()) {
                    analysis.vulnerabilities.push({
                        type: 'expired_certificate',
                        severity: 'critical',
                        description: 'Certificate has expired'
                    });
                }
            }

            // Check authorization
            if (!manualResult.authorized && manualResult.authorizationError) {
                analysis.vulnerabilities.push({
                    type: 'certificate_error',
                    severity: 'high',
                    description: manualResult.authorizationError
                });
            }

            tool = 'manual';
        }

        // Calculate score
        const score = this.calculateScore(analysis);

        // Emit evidence for vulnerabilities
        for (const vuln of analysis.vulnerabilities) {
            const evidenceId = ctx.emitEvidence({
                type: 'tls_vulnerability',
                source: this.name,
                data: vuln
            });

            ctx.emitClaim({
                claim_type: vuln.type === 'expired_certificate' ? 'expired_certificate' :
                    vuln.type === 'weak_ciphers' ? 'weak_tls_config' :
                        'vulnerable_protocol',
                subject: target,
                predicate: {
                    vulnerability: vuln.type,
                    severity: vuln.severity,
                    description: vuln.description
                },
                base_rate: 0.3
            });

            const weight = vuln.severity === 'critical' ? 1.0 :
                vuln.severity === 'high' ? 0.9 : 0.7;

            ctx.ledger.addEvidence(
                ctx.ledger.generateClaimId('weak_tls_config', target),
                'active_probe_success',
                weight,
                this.name,
                evidenceId
            );
        }

        return {
            tool,
            certificate: analysis.certificate,
            protocols: analysis.protocols,
            ciphers: analysis.ciphers,
            vulnerabilities: analysis.vulnerabilities,
            score,
            grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
        };
    }
}

export default TLSAnalyzer;
