/**
 * WAFDetector - Web Application Firewall detection
 * 
 * Detects WAF presence to inform exploitation strategy
 * and adjust testing approach accordingly.
 */

import { BaseAgent } from '../base-agent.js';
import { runTool, isToolAvailable } from '../../tools/runners/tool-runner.js';

export class WAFDetector extends BaseAgent {
    constructor(options = {}) {
        super('WAFDetector', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL to check' }
            }
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                detected: { type: 'boolean' },
                waf: { type: 'string' },
                confidence: { type: 'number' },
                details: { type: 'object' }
            }
        };

        this.requires = {
            evidence_kinds: ['http_response'],
            model_nodes: ['endpoints']
        };

        this.emits = {
            evidence_events: ['waf_detected', 'waf_fingerprint'],
            model_updates: ['waf_protection'],
            claims: ['waf_present', 'protected_by_waf'],
            artifacts: ['waf_detection_results.json']
        };

        this.default_budget = {
            max_time_ms: 60000,
            max_network_requests: 10,
            max_tokens: 0,
            max_tool_invocations: 1
        };

        // WAF fingerprints based on response patterns
        this.wafSignatures = {
            cloudflare: {
                headers: ['cf-ray', 'cf-cache-status', 'cf-request-id'],
                serverPatterns: [/cloudflare/i],
                bodyPatterns: [/cloudflare/i, /error code: 1/i]
            },
            akamai: {
                headers: ['x-akamai-transformed', 'akamai-grn'],
                serverPatterns: [/akamai/i, /ghost/i],
                bodyPatterns: [/akamai/i, /reference.*#/i]
            },
            aws_waf: {
                headers: ['x-amzn-requestid', 'x-amz-cf-id'],
                serverPatterns: [/awselb/i, /amazon/i],
                bodyPatterns: [/aws/i, /amazon/i]
            },
            imperva: {
                headers: ['x-iinfo', 'x-cdn'],
                serverPatterns: [/imperva/i, /incapsula/i],
                bodyPatterns: [/incapsula/i, /imperva/i]
            },
            sucuri: {
                headers: ['x-sucuri-id', 'x-sucuri-cache'],
                serverPatterns: [/sucuri/i],
                bodyPatterns: [/sucuri/i, /cloudproxy/i]
            },
            modsecurity: {
                headers: ['x-modsecurity-id'],
                serverPatterns: [/mod_security/i, /modsecurity/i],
                bodyPatterns: [/mod_security/i, /owasp/i]
            },
            f5_bigip: {
                headers: ['x-wa-info', 'f5-asm'],
                serverPatterns: [/bigip/i, /f5/i],
                bodyPatterns: [/support id/i, /f5/i]
            },
            barracuda: {
                headers: ['barra_counter'],
                serverPatterns: [/barracuda/i],
                bodyPatterns: [/barracuda/i]
            },
            fortinet: {
                headers: ['fortigate', 'fortiwafs'],
                serverPatterns: [/fortinet/i, /fortigate/i],
                bodyPatterns: [/fortiguard/i]
            },
            nginx_waf: {
                headers: [],
                serverPatterns: [/nginx/i],
                bodyPatterns: [/nginx/i]  // Only if blocked
            }
        };

        // Malicious payloads to trigger WAF detection
        this.testPayloads = [
            { path: "/?test=<script>alert(1)</script>", type: 'xss' },
            { path: "/?test=' OR 1=1 --", type: 'sqli' },
            { path: "/?test=../../../etc/passwd", type: 'lfi' },
            { path: "/?test=;cat /etc/passwd", type: 'cmdi' },
            { path: "/wp-admin/", type: 'admin' }
        ];
    }

    /**
     * Run wafw00f
     */
    async runWafw00f(target) {
        const cmd = `wafw00f "${target}" -o /dev/stdout -f json`;
        const result = await runTool(cmd, { timeout: 60000 });

        try {
            const lines = result.stdout.split('\n').filter(l => l.trim().startsWith('{'));
            for (const line of lines) {
                const data = JSON.parse(line);
                if (data.url) {
                    return data;
                }
            }
        } catch { }

        return null;
    }

    /**
     * Manual WAF detection
     */
    async manualDetection(target) {
        const results = {
            detected: false,
            waf: null,
            evidence: [],
            blockedPayloads: []
        };

        // First, get baseline response
        let baseline;
        try {
            baseline = await fetch(target, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0' }
            });
        } catch (e) {
            return { error: e.message };
        }

        const baselineHeaders = {};
        baseline.headers.forEach((value, key) => {
            baselineHeaders[key.toLowerCase()] = value;
        });

        // Check headers for WAF signatures
        for (const [wafName, sig] of Object.entries(this.wafSignatures)) {
            for (const header of sig.headers) {
                if (baselineHeaders[header.toLowerCase()]) {
                    results.detected = true;
                    results.waf = wafName;
                    results.evidence.push({
                        type: 'header',
                        header,
                        value: baselineHeaders[header.toLowerCase()]
                    });
                }
            }

            // Check server header
            const serverHeader = baselineHeaders['server'] || '';
            for (const pattern of sig.serverPatterns) {
                if (pattern.test(serverHeader)) {
                    results.detected = true;
                    results.waf = wafName;
                    results.evidence.push({
                        type: 'server_header',
                        value: serverHeader
                    });
                }
            }
        }

        // Test with malicious payloads
        const baseUrl = new URL(target).origin;

        for (const payload of this.testPayloads) {
            try {
                const response = await fetch(baseUrl + payload.path, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0' }
                });

                // Check if blocked (403, different response)
                if (response.status === 403 || response.status === 406 || response.status === 503) {
                    results.blockedPayloads.push({
                        payload: payload.path,
                        type: payload.type,
                        status: response.status
                    });

                    // Try to determine WAF from block page
                    const body = await response.text();
                    for (const [wafName, sig] of Object.entries(this.wafSignatures)) {
                        for (const pattern of sig.bodyPatterns) {
                            if (pattern.test(body)) {
                                results.detected = true;
                                results.waf = wafName;
                                results.evidence.push({
                                    type: 'block_page',
                                    pattern: pattern.toString(),
                                    payload: payload.type
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                // Request blocked
                results.blockedPayloads.push({
                    payload: payload.path,
                    type: payload.type,
                    error: e.message
                });
            }
        }

        // If payloads were blocked but WAF not identified
        if (results.blockedPayloads.length > 0 && !results.waf) {
            results.detected = true;
            results.waf = 'unknown';
        }

        return results;
    }

    /**
     * Main execution
     */
    async run(ctx, inputs) {
        const { target } = inputs;

        let result = null;
        let tool = 'manual';

        // Try wafw00f first
        if (await isToolAvailable('wafw00f')) {
            ctx.recordToolInvocation();
            const wafw00fResult = await this.runWafw00f(target);

            if (wafw00fResult) {
                result = {
                    detected: wafw00fResult.detected || wafw00fResult.firewall !== null,
                    waf: wafw00fResult.firewall || wafw00fResult.waf,
                    manufacturer: wafw00fResult.manufacturer,
                    tool: 'wafw00f'
                };
                tool = 'wafw00f';
            }
        }

        // Fallback to manual detection
        if (!result) {
            ctx.recordNetworkRequest();
            result = await this.manualDetection(target);
            result.tool = 'manual';
            tool = 'manual';
        }

        if (result.error) {
            return {
                detected: false,
                error: result.error,
                tool
            };
        }

        // Calculate confidence
        let confidence = 0;
        if (result.detected) {
            if (result.evidence?.length > 0) {
                confidence = Math.min(1.0, 0.3 + (result.evidence.length * 0.2));
            }
            if (result.blockedPayloads?.length > 0) {
                confidence = Math.min(1.0, confidence + (result.blockedPayloads.length * 0.1));
            }
            if (result.waf && result.waf !== 'unknown') {
                confidence = Math.min(1.0, confidence + 0.2);
            }
            confidence = Math.max(0.5, confidence);  // Minimum 50% if detected
        }

        // Emit evidence
        if (result.detected) {
            const evidenceId = ctx.emitEvidence({
                type: 'waf_detected',
                source: this.name,
                data: {
                    waf: result.waf,
                    confidence,
                    evidence: result.evidence,
                    blockedPayloads: result.blockedPayloads?.length
                }
            });

            ctx.emitClaim({
                claim_type: 'waf_present',
                subject: target,
                predicate: {
                    waf: result.waf,
                    confidence
                },
                base_rate: 0.4  // WAFs are common
            });

            ctx.ledger.addEvidence(
                ctx.ledger.generateClaimId('waf_present', target),
                'active_probe_success',
                confidence,
                this.name,
                evidenceId
            );
        }

        return {
            detected: result.detected,
            waf: result.waf,
            manufacturer: result.manufacturer,
            confidence,
            evidence: result.evidence,
            blockedPayloads: result.blockedPayloads,
            tool,
            implications: result.detected ? [
                'Exploitation attempts may be blocked',
                'Consider WAF bypass techniques',
                'Adjust payload encoding',
                'Some vulnerabilities may be harder to confirm'
            ] : []
        };
    }
}

export default WAFDetector;
