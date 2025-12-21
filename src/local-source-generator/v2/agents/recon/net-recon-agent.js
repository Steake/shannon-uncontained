/**
 * NetReconAgent - Network reconnaissance agent
 * 
 * Discovers network topology, ports, and services.
 * Emits EvidenceEvents, not claims (low inference).
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, isToolAvailable, getToolTimeout } from '../../tools/runners/tool-runner.js';
import { normalizeNmap } from '../../tools/normalizers/evidence-normalizers.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';

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
        const nmapAvailable = await isToolAvailable('nmap');
        results.tool_available = nmapAvailable;

        if (!nmapAvailable) {
            // Emit tool unavailable event
            ctx.emitEvidence(createEvidenceEvent({
                source: 'NetReconAgent',
                event_type: EVENT_TYPES.TOOL_ERROR,
                target: hostname,
                payload: { tool: 'nmap', error: 'Tool not available' },
            }));

            return results;
        }

        ctx.recordToolInvocation();

        // Build nmap command
        const ports = inputs.ports || '21,22,23,25,53,80,110,143,443,445,993,995,3306,3389,5432,8080,8443';
        const flags = inputs.aggressive ? '-A' : '-sV';
        const command = `nmap ${flags} -p ${ports} --open -oG - ${hostname}`;

        // Run nmap
        const result = await runToolWithRetry(command, {
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
