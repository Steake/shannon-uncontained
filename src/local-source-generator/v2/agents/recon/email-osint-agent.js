/**
 * EmailOSINTAgent - Email Intelligence Gathering Agent
 * 
 * Gathers OSINT data from multiple sources for a given email address:
 * - HaveIBeenPwned (breach lookups)
 * - EmailRep.io (reputation scoring)
 * - Hunter.io (domain patterns, verification)
 * - Holehe (social account discovery)
 * - DNS MX (mail server records)
 */

import { BaseAgent } from '../base-agent.js';
import { runToolWithRetry, isToolAvailable, getToolTimeout } from '../../tools/runners/tool-runner.js';
import { createEvidenceEvent, EVENT_TYPES } from '../../worldmodel/evidence-graph.js';
import dns from 'dns/promises';
import chalk from 'chalk';

// Extend EVENT_TYPES for email OSINT (exported for use elsewhere)
export const EMAIL_EVENT_TYPES = {
    EMAIL_INTEL: 'email_intel',
    BREACH_DATA: 'breach_data',
    EMAIL_REPUTATION: 'email_reputation',
    SOCIAL_ACCOUNT: 'social_account',
};

/**
 * Email validation regex with improved domain validation.
 * Pattern structure:
 * - Local part: [^\s@]+ (any non-whitespace, non-@ characters)
 * - @ separator
 * - Domain labels: [\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?
 *   * Must start and end with letter/number (Unicode supported)
 *   * Hyphens allowed internally (max 63 chars per label)
 *   * Prevents domains starting with hyphen
 * - Multiple domain labels separated by dots
 * - Requires at least 2-level domain (e.g., example.com)
 */
const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)+$/u;

export class EmailOSINTAgent extends BaseAgent {
    constructor(options = {}) {
        super('EmailOSINTAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['email'],
            properties: {
                email: { type: 'string', description: 'Target email address' },
                include_breaches: { type: 'boolean', description: 'Include breach lookups', default: true },
                include_social: { type: 'boolean', description: 'Check for social accounts', default: true },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                email: { type: 'string' },
                domain: { type: 'string' },
                valid: { type: 'boolean' },
                breaches: { type: 'array', items: { type: 'object' } },
                reputation: { type: 'object' },
                mx_records: { type: 'array', items: { type: 'string' } },
                social_accounts: { type: 'array', items: { type: 'object' } },
                domain_info: { type: 'object' },
                sources_queried: { type: 'array', items: { type: 'string' } },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [
                EMAIL_EVENT_TYPES.EMAIL_INTEL,
                EMAIL_EVENT_TYPES.BREACH_DATA,
                EMAIL_EVENT_TYPES.EMAIL_REPUTATION,
                EMAIL_EVENT_TYPES.SOCIAL_ACCOUNT,
                EVENT_TYPES.DNS_RECORD,
            ],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 60000,
            max_network_requests: 20,
            max_tokens: 0,
            max_tool_invocations: 5,
        };
    }

    async run(ctx, inputs) {
        const { email, include_breaches = true, include_social = true } = inputs;

        // Validate email format
        if (!this.isValidEmail(email)) {
            throw new Error(`Invalid email format: ${email}`);
        }

        const domain = email.split('@')[1];
        const results = {
            email,
            domain,
            valid: true,
            breaches: [],
            reputation: {},
            mx_records: [],
            social_accounts: [],
            domain_info: {},
            sources_queried: [],
        };

        // 1. DNS MX Lookup
        this.setStatus('Querying MX records...');
        try {
            const mxRecords = await dns.resolveMx(domain);
            results.mx_records = mxRecords
                .sort((a, b) => a.priority - b.priority)
                .map(r => r.exchange);
            results.sources_queried.push('dns_mx');

            ctx.emitEvidence(createEvidenceEvent({
                source: 'EmailOSINTAgent',
                event_type: EVENT_TYPES.DNS_RECORD,
                target: email,
                payload: {
                    record_type: 'MX',
                    domain,
                    records: results.mx_records,
                },
            }));
        } catch (err) {
            // Domain might not have MX records; on any DNS error we fall back to an empty list.
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.log(chalk.gray(`EmailOSINTAgent: MX lookup failed for domain "${domain}": ${errorMessage}`));
            results.mx_records = [];
        }

        // 2. EmailRep.io (free, no API key required)
        this.setStatus('Checking email reputation...');
        ctx.recordNetworkRequest();
        try {
            const emailRepResponse = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
                headers: {
                    'User-Agent': 'Shannon-LSG/2.0',
                    'Accept': 'application/json',
                },
            });

            if (emailRepResponse.ok) {
                const repData = await emailRepResponse.json();
                results.reputation = {
                    reputation: repData.reputation,
                    suspicious: repData.suspicious,
                    references: repData.references || 0,
                    details: repData.details || {},
                    profiles: repData.details?.profiles || [],
                };
                results.sources_queried.push('emailrep.io');

                ctx.emitEvidence(createEvidenceEvent({
                    source: 'emailrep.io',
                    event_type: EMAIL_EVENT_TYPES.EMAIL_REPUTATION,
                    target: email,
                    payload: results.reputation,
                }));
            }
        } catch (error) {
            // EmailRep might be rate-limited or unavailable
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(chalk.gray(`EmailOSINTAgent: EmailRep.io request failed for ${email}: ${errorMsg}`));
        }

        // 3. HaveIBeenPwned (public breach lookup - rate limited)
        if (include_breaches) {
            this.setStatus('Checking breach databases...');
            ctx.recordNetworkRequest();
            try {
                // Note: HIBP API v3 requires API key, but we can still try v2 public endpoint
                // or use the haveibeenpwned-api-key from env if available
                const hibpApiKey = process.env.HIBP_API_KEY;

                const headers = {
                    'User-Agent': 'Shannon-LSG/2.0',
                    'Accept': 'application/json',
                };

                if (hibpApiKey) {
                    headers['hibp-api-key'] = hibpApiKey;
                }

                const hibpResponse = await fetch(
                    `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
                    { headers }
                );

                if (hibpResponse.ok) {
                    const breaches = await hibpResponse.json();
                    results.breaches = breaches.map(b => ({
                        name: b.Name,
                        title: b.Title,
                        domain: b.Domain,
                        breach_date: b.BreachDate,
                        added_date: b.AddedDate,
                        pwn_count: b.PwnCount,
                        data_classes: b.DataClasses,
                        is_verified: b.IsVerified,
                        is_sensitive: b.IsSensitive,
                    }));
                    results.sources_queried.push('haveibeenpwned');

                    for (const breach of results.breaches) {
                        ctx.emitEvidence(createEvidenceEvent({
                            source: 'haveibeenpwned',
                            event_type: EMAIL_EVENT_TYPES.BREACH_DATA,
                            target: email,
                            payload: breach,
                        }));
                    }
                } else if (hibpResponse.status === 404) {
                    // No breaches found - this is good news
                    results.sources_queried.push('haveibeenpwned');
                } else if (hibpResponse.status === 401) {
                    // Authentication failed - API key is invalid or missing
                    if (hibpApiKey) {
                        console.log(chalk.yellow(`⚠️  HIBP API key appears invalid (401 response)`));
                    } else {
                        console.log(chalk.yellow(`⚠️  HIBP API v3 requires an API key (set HIBP_API_KEY environment variable)`));
                    }
                    results.sources_queried.push('haveibeenpwned');
                } else if (hibpResponse.status === 429) {
                    console.log(chalk.yellow(`⚠️  HIBP rate limit exceeded (429 response)`));
                    results.sources_queried.push('haveibeenpwned');
                }
                // Other status codes are logged in catch block
            } catch (error) {
                // HIBP might be unavailable
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(chalk.gray(`EmailOSINTAgent: HaveIBeenPwned request failed for ${email}: ${errorMsg}`));
            }
        }

        // 4. Holehe (social account checker via CLI tool)
        if (include_social) {
            this.setStatus('Checking social accounts...');
            const holeheAvailable = await isToolAvailable('holehe');

            if (holeheAvailable) {
                ctx.recordToolInvocation();
                const holeheCmd = `holehe ${email} --only-used --no-color`;
                const result = await runToolWithRetry(holeheCmd, {
                    timeout: getToolTimeout('holehe') || 30000,
                });

                if (result.success && result.stdout) {
                    const accounts = this.parseHoleheOutput(result.stdout);
                    results.social_accounts = accounts;
                    results.sources_queried.push('holehe');

                    for (const account of accounts) {
                        ctx.emitEvidence(createEvidenceEvent({
                            source: 'holehe',
                            event_type: EMAIL_EVENT_TYPES.SOCIAL_ACCOUNT,
                            target: email,
                            payload: account,
                        }));
                    }
                }
            }
        }

        // 5. Hunter.io (domain email patterns - requires API key)
        const hunterApiKey = process.env.HUNTER_API_KEY;
        if (hunterApiKey) {
            this.setStatus('Querying Hunter.io...');
            ctx.recordNetworkRequest();
            try {
                // TODO: Hunter.io API currently uses api_key as query parameter.
                // This exposes keys in URLs/logs. Consider migrating to header-based auth
                // once Hunter.io API support is verified (e.g., X-API-Key or Authorization header).
                const hunterResponse = await fetch(
                    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${hunterApiKey}`,
                    { headers: { 'Accept': 'application/json' } }
                );

                if (hunterResponse.ok) {
                    const hunterData = await hunterResponse.json();
                    if (hunterData.data) {
                        results.domain_info = {
                            status: hunterData.data.status,
                            score: hunterData.data.score,
                            position: hunterData.data.position,
                            company: hunterData.data.company,
                            first_name: hunterData.data.first_name,
                            last_name: hunterData.data.last_name,
                            sources: hunterData.data.sources?.length || 0,
                        };
                        results.sources_queried.push('hunter.io');

                        ctx.emitEvidence(createEvidenceEvent({
                            source: 'hunter.io',
                            event_type: EMAIL_EVENT_TYPES.EMAIL_INTEL,
                            target: email,
                            payload: results.domain_info,
                        }));
                    }
                }
            } catch (error) {
                // Hunter.io might be unavailable or the request may have failed
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(chalk.gray(`EmailOSINTAgent: Hunter.io request failed for ${email}: ${errorMsg}`));
            }
        }

        // Emit summary evidence
        ctx.emitEvidence(createEvidenceEvent({
            source: 'EmailOSINTAgent',
            event_type: EMAIL_EVENT_TYPES.EMAIL_INTEL,
            target: email,
            payload: {
                summary: true,
                sources_queried: results.sources_queried,
                breach_count: results.breaches.length,
                social_account_count: results.social_accounts.length,
                has_mx_records: results.mx_records.length > 0,
                reputation: results.reputation.reputation,
            },
        }));

        return results;
    }

    /**
     * Validate email format using the module-level EMAIL_VALIDATION_REGEX constant.
     */
    isValidEmail(email) {
        return EMAIL_VALIDATION_REGEX.test(email);
    }

    /**
     * Parse Holehe CLI output
     */
    parseHoleheOutput(stdout) {
        const accounts = [];
        const lines = stdout.split('\n');

        for (const line of lines) {
            // Holehe format: [+] service: email exists
            // Match service names including hyphens and dots (e.g., "linkedin-jobs", "github.com")
            const match = line.match(/\[\+\]\s*([\w.-]+)/i);
            if (match) {
                accounts.push({
                    service: match[1],
                    exists: true,
                });
            }
        }

        return accounts;
    }
}

export default EmailOSINTAgent;
