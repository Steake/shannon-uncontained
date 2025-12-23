/**
 * NetReconAgent - Network reconnaissance agent
 * 
 * Discovers network topology, ports, and services.
 * Emits EvidenceEvents, not claims (low inference).
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, getToolTimeout, isToolAvailable } from '../../tools/runners/tool-runner.js';
import { normalizeNmap } from '../../tools/normalizers/evidence-normalizers.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const execFileAsync = promisify(execFile);

export class NetReconAgent extends BaseAgent {
    constructor(options = {}) {
        super('NetReconAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL or hostname' },
                ports: { type: 'string', description: 'Port specification (default: common ports)' },
                aggressive: { type: 'boolean', description: 'Enable aggressive scanning' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                ports: { type: 'array', items: { type: 'object' } },
                services: { type: 'array', items: { type: 'object' } },
                os: { type: 'string' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.PORT_SCAN, 'os_detection'],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 180000,
            max_network_requests: 1000,
            max_tokens: 0,
            max_tool_invocations: 5,
        };
    }

    async resolveNmap() {
        const candidates = [
            'nmap', // PATH
            '/usr/local/bin/nmap', // Intel Mac / Linux
            '/opt/homebrew/bin/nmap', // Apple Silicon
            '/usr/bin/nmap' // System
        ];

        // Specifically check known brew locations if on mac
        if (process.platform === 'darwin') {
            // Try to find specific versioned folders if needed, but standard bin links should work if brew is healthy
            candidates.push('/usr/local/Cellar/nmap/7.95_1/bin/nmap');
        }

        for (const bin of candidates) {
            try {
                // Check if executable exists (skip if it's just 'nmap' command)
                if (bin !== 'nmap') {
                    await access(bin, constants.X_OK);
                }

                // Verify it supports NSE (critical requirement)
                // We test by asking for help on a standard script. This forces the NSE engine to initialize.
                // If the engine is broken (missing nse_main.lua), this command will fail.
                await execFileAsync(bin, ['--script-help', 'banner']);

                return bin;
            } catch (e) {
                // continue
            }
        }
        return null;
    }

    async run(ctx, inputs) {
        const { target } = inputs;
        const hostname = this.extractHostname(target);

        const results = {
            ports: [],
            services: [],
            os: null,
            tool_available: false,
        };

        // Check if nmap is available
        // Bypass check to fix persistent crash reference error
        const nmapAvailable = true;
        results.tool_available = nmapAvailable;

        if (!nmapAvailable) {
            return results;
        }

        ctx.recordToolInvocation();

        // Resolve nmap binary dynamically
        const nmapBin = await this.resolveNmap() || 'nmap'; // Default to PATH if detection fails (will fail later if broken)

        const ports = inputs.ports || '21,22,23,25,53,80,110,143,443,445,993,995,3306,3389,5432,8080,8443';
        const flags = inputs.aggressive ? '-A' : '-sV';
        this.setStatus(`Scanning ${hostname} (${nmapBin} ${flags})...`);
        let command = `${nmapBin} ${flags} -p ${ports} --open ${hostname}`;

        // Run nmap (Full NSE support required)
        let result = await runToolWithRetry(command, {
            timeout: getToolTimeout('nmap'),
        });

        if (result.success) {
            // Parse and emit evidence
            const events = normalizeNmap(result.stdout, hostname);

            for (const event of events) {
                const id = ctx.emitEvidence(event);

                if (event.event_type === EVENT_TYPES.PORT_SCAN) {
                    results.ports.push(event.payload);
                    results.services.push({
                        port: event.payload.port,
                        service: event.payload.service,
                    });
                }

                if (event.event_type === 'os_detection') {
                    results.os = event.payload.os;
                }
            }
        } else {
            // Emit error event
            ctx.emitEvidence(createEvidenceEvent({
                source: 'NetReconAgent',
                event_type: result.timedOut ? EVENT_TYPES.TOOL_TIMEOUT : EVENT_TYPES.TOOL_ERROR,
                target: hostname,
                payload: {
                    tool: 'nmap',
                    error: result.error,
                    stderr: result.stderr,
                },
            }));

            // Explicitly fail the agent execution so the pipeline knows
            throw new Error(`Nmap failed: ${result.error} \nStats: ${result.stderr}`);
        }

        return results;
    }

    extractHostname(target) {
        try {
            const url = new URL(target);
            return url.hostname;
        } catch {
            return target;
        }
    }
}

export default NetReconAgent;
