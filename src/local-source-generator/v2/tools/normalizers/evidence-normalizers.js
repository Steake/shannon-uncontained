/**
 * Evidence Normalizers - Convert tool outputs to EvidenceEvents
 * 
 * Each normalizer takes raw tool output and produces structured EvidenceEvents.
 */

import { createEvidenceEvent, EVENT_TYPES } from '../../worldmodel/evidence-graph.js';

/**
 * Parse nmap output to evidence events
 * @param {string} output - Nmap output
 * @param {string} target - Target URL/host
 * @returns {object[]} Array of evidence events
 */
export function normalizeNmap(output, target) {
    const events = [];
    const lines = output.split('\n');

    for (const line of lines) {
        // Match port lines: "80/tcp   open  http"
        const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+(\w+)\s+(.*)$/);
        if (portMatch) {
            const [, port, protocol, state, service] = portMatch;
            events.push(createEvidenceEvent({
                source: 'nmap',
                event_type: EVENT_TYPES.PORT_SCAN,
                target,
                payload: {
                    port: parseInt(port, 10),
                    protocol,
                    state,
                    service: service.trim(),
                },
            }));
        }

        // Match OS detection
        const osMatch = line.match(/^OS details: (.+)$/);
        if (osMatch) {
            events.push(createEvidenceEvent({
                source: 'nmap',
                event_type: 'os_detection',
                target,
                payload: { os: osMatch[1] },
            }));
        }
    }

    return events;
}

/**
 * Parse subfinder output to evidence events
 * @param {string} output - Subfinder output (one subdomain per line)
 * @param {string} target - Target domain
 * @returns {object[]} Array of evidence events
 */
export function normalizeSubfinder(output, target) {
    const events = [];
    const subdomains = output.split('\n').filter(s => s.trim());

    for (const subdomain of subdomains) {
        events.push(createEvidenceEvent({
            source: 'subfinder',
            event_type: EVENT_TYPES.DNS_RECORD,
            target,
            payload: {
                subdomain: subdomain.trim(),
                record_type: 'subdomain',
            },
        }));
    }

    return events;
}

/**
 * Parse whatweb output to evidence events
 * @param {string} output - Whatweb JSON output
 * @param {string} target - Target URL
 * @returns {object[]} Array of evidence events
 */
export function normalizeWhatweb(output, target) {
    const events = [];

    try {
        const data = JSON.parse(output);
        const results = Array.isArray(data) ? data : [data];

        for (const result of results) {
            if (result.plugins) {
                for (const [plugin, info] of Object.entries(result.plugins)) {
                    events.push(createEvidenceEvent({
                        source: 'whatweb',
                        event_type: 'tech_detection',
                        target,
                        payload: {
                            technology: plugin,
                            version: info.version?.[0] || null,
                            confidence: info.certainty || 100,
                            details: info,
                        },
                    }));
                }
            }
        }
    } catch {
        // Try line-based parsing for non-JSON output
        const techMatches = output.matchAll(/\[([^\]]+)\]/g);
        for (const match of techMatches) {
            events.push(createEvidenceEvent({
                source: 'whatweb',
                event_type: 'tech_detection',
                target,
                payload: { technology: match[1] },
            }));
        }
    }

    return events;
}

/**
 * Parse gau output to evidence events
 * @param {string} output - Gau output (one URL per line)
 * @param {string} target - Target domain
 * @returns {object[]} Array of evidence events
 */
export function normalizeGau(output, target) {
    const events = [];
    const urls = output.split('\n').filter(u => u.trim());

    for (const urlStr of urls) {
        try {
            const url = new URL(urlStr.trim());
            const method = guessMethodFromUrl(url);
            const params = extractParams(url);

            events.push(createEvidenceEvent({
                source: 'gau',
                event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                target,
                payload: {
                    url: urlStr.trim(),
                    path: url.pathname,
                    method,
                    params,
                    discovery_method: 'historical',
                },
            }));
        } catch {
            // Skip invalid URLs
        }
    }

    return events;
}

/**
 * Parse katana output to evidence events
 * @param {string} output - Katana JSON output
 * @param {string} target - Target URL
 * @returns {object[]} Array of evidence events
 */
export function normalizeKatana(output, target) {
    const events = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
        try {
            const data = JSON.parse(line);

            if (data.request?.endpoint) {
                const url = new URL(data.request.endpoint);
                events.push(createEvidenceEvent({
                    source: 'katana',
                    event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                    target,
                    payload: {
                        url: data.request.endpoint,
                        path: url.pathname,
                        method: data.request.method || 'GET',
                        params: extractParams(url),
                        discovery_method: 'active_crawl',
                        source_url: data.request.source,
                    },
                }));
            }

            // Forms
            if (data.request?.tag === 'form') {
                events.push(createEvidenceEvent({
                    source: 'katana',
                    event_type: EVENT_TYPES.FORM_DISCOVERED,
                    target,
                    payload: {
                        action: data.request.endpoint,
                        method: data.request.method || 'POST',
                        source_url: data.request.source,
                    },
                }));
            }
        } catch {
            // Try as plain URL
            if (line.startsWith('http')) {
                try {
                    const url = new URL(line.trim());
                    events.push(createEvidenceEvent({
                        source: 'katana',
                        event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                        target,
                        payload: {
                            url: line.trim(),
                            path: url.pathname,
                            method: 'GET',
                            params: extractParams(url),
                            discovery_method: 'active_crawl',
                        },
                    }));
                } catch { /* skip */ }
            }
        }
    }

    return events;
}

/**
 * Parse httpx output to evidence events
 * @param {string} output - Httpx JSON output
 * @param {string} target - Target URL
 * @returns {object[]} Array of evidence events
 */
export function normalizeHttpx(output, target) {
    const events = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
        try {
            const data = JSON.parse(line);

            events.push(createEvidenceEvent({
                source: 'httpx',
                event_type: EVENT_TYPES.HTTP_RESPONSE,
                target,
                payload: {
                    url: data.url,
                    status_code: data.status_code,
                    content_length: data.content_length,
                    content_type: data.content_type,
                    title: data.title,
                    technologies: data.tech || [],
                    server: data.webserver,
                    tls: data.tls ? {
                        cipher: data.tls.cipher,
                        version: data.tls.version,
                    } : null,
                },
            }));

            // Tech detection from httpx
            if (data.tech) {
                for (const tech of data.tech) {
                    events.push(createEvidenceEvent({
                        source: 'httpx',
                        event_type: 'tech_detection',
                        target,
                        payload: { technology: tech },
                    }));
                }
            }
        } catch { /* skip */ }
    }

    return events;
}

/**
 * Guess HTTP method from URL patterns
 * @param {URL} url - URL object
 * @returns {string} Guessed method
 */
function guessMethodFromUrl(url) {
    const path = url.pathname.toLowerCase();

    if (path.includes('delete') || path.includes('remove')) return 'DELETE';
    if (path.includes('update') || path.includes('edit')) return 'PUT';
    if (path.includes('create') || path.includes('add') || path.includes('new')) return 'POST';
    if (path.includes('login') || path.includes('register') || path.includes('signup')) return 'POST';
    if (path.includes('search') || path.includes('query')) return 'GET';

    // Check for form-like query params
    if (url.searchParams.has('action')) return 'POST';

    return 'GET';
}

/**
 * Extract parameters from URL
 * @param {URL} url - URL object
 * @returns {object[]} Array of { name, type, location }
 */
function extractParams(url) {
    const params = [];

    // Query params
    for (const [name, value] of url.searchParams) {
        params.push({
            name,
            type: inferType(value),
            location: 'query',
            example: value,
        });
    }

    // Path params (segments that look like IDs)
    const segments = url.pathname.split('/').filter(s => s);
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (looksLikeId(seg)) {
            params.push({
                name: segments[i - 1] ? `${segments[i - 1]}_id` : 'id',
                type: inferType(seg),
                location: 'path',
                example: seg,
            });
        }
    }

    return params;
}

/**
 * Check if a string looks like an ID
 * @param {string} value - Value to check
 * @returns {boolean} Whether it looks like an ID
 */
function looksLikeId(value) {
    // UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;
    // Numeric ID
    if (/^\d+$/.test(value)) return true;
    // MongoDB ObjectId
    if (/^[0-9a-f]{24}$/i.test(value)) return true;
    // Short hash
    if (/^[0-9a-z]{6,12}$/i.test(value) && /\d/.test(value)) return true;

    return false;
}

/**
 * Infer type from value
 * @param {string} value - Value to analyze
 * @returns {string} Inferred type
 */
function inferType(value) {
    if (/^\d+$/.test(value)) return 'integer';
    if (/^\d+\.\d+$/.test(value)) return 'number';
    if (/^(true|false)$/i.test(value)) return 'boolean';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'uuid';
    if (/^[0-9a-f]{24}$/i.test(value)) return 'objectid';
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (/@/.test(value)) return 'email';

    return 'string';
}

export default {
    normalizeNmap,
    normalizeSubfinder,
    normalizeWhatweb,
    normalizeGau,
    normalizeKatana,
    normalizeHttpx,
};
