/**
 * SitemapAgent - Sitemap.xml and robots.txt mining for URL discovery
 * 
 * Extracts URLs from sitemap files and analyzes robots.txt for disallowed
 * paths (which often reveal API endpoints and admin areas).
 */

import { BaseAgent } from '../base-agent.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';
import fetch from 'node-fetch';

// Common sitemap paths
const SITEMAP_PATHS = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap1.xml',
    '/sitemaps/sitemap.xml',
    '/wp-sitemap.xml',
    '/sitemap.txt',
];

export class SitemapAgent extends BaseAgent {
    constructor(options = {}) {
        super('SitemapAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                sitemap_urls: { type: 'number' },
                robots_paths: { type: 'number' },
                api_hints: { type: 'array' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.ENDPOINT_DISCOVERED, 'sitemap_parsed', 'robots_parsed'],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 30000,
            max_network_requests: 20,
            max_tokens: 0,
            max_tool_invocations: 0,
        };
    }

    async run(ctx, inputs) {
        const { target } = inputs;
        const baseUrl = this.normalizeBaseUrl(target);

        const results = {
            sitemap_urls: 0,
            robots_paths: 0,
            api_hints: [],
        };

        // Parse robots.txt first (contains sitemap references)
        this.setStatus('Fetching robots.txt...');
        const robotsData = await this.parseRobotsTxt(ctx, baseUrl);
        results.robots_paths = robotsData.disallowed.length;

        // Emit robots.txt evidence
        if (robotsData.disallowed.length > 0 || robotsData.sitemaps.length > 0) {
            ctx.emitEvidence({
                source: this.name,
                event_type: 'robots_parsed',
                target,
                payload: robotsData,
            });
        }

        // Check disallowed paths for API hints
        for (const path of robotsData.disallowed) {
            if (this.isApiPath(path)) {
                results.api_hints.push(path);
                ctx.emitEvidence({
                    source: this.name,
                    event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                    target,
                    payload: {
                        method: 'GET',
                        path,
                        url: `${baseUrl}${path}`,
                        source: 'robots.txt',
                    },
                });
            }
        }

        // Collect sitemap URLs from robots.txt and common paths
        const sitemapUrls = new Set([
            ...robotsData.sitemaps,
            ...SITEMAP_PATHS.map(p => `${baseUrl}${p}`),
        ]);

        // Parse sitemaps
        this.setStatus(`Parsing ${sitemapUrls.size} potential sitemaps...`);
        const parsedUrls = new Set();

        for (const sitemapUrl of sitemapUrls) {
            const urls = await this.parseSitemap(ctx, sitemapUrl, parsedUrls);
            results.sitemap_urls += urls.length;

            // Emit endpoints from sitemap URLs
            for (const url of urls) {
                try {
                    const parsed = new URL(url);
                    const path = parsed.pathname + parsed.search;

                    // Filter for API-like URLs
                    if (this.isApiPath(path)) {
                        results.api_hints.push(path);
                        ctx.emitEvidence({
                            source: this.name,
                            event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                            target,
                            payload: {
                                method: 'GET',
                                path,
                                url,
                                source: 'sitemap',
                            },
                        });
                    }
                } catch {
                    // Invalid URL
                }
            }
        }

        this.setStatus(`Found ${results.sitemap_urls} URLs, ${results.api_hints.length} API hints`);
        return results;
    }

    normalizeBaseUrl(target) {
        try {
            const url = new URL(target);
            return `${url.protocol}//${url.host}`;
        } catch {
            return target.replace(/\/$/, '');
        }
    }

    async parseRobotsTxt(ctx, baseUrl) {
        const result = {
            disallowed: [],
            sitemaps: [],
            raw: '',
        };

        try {
            ctx.recordNetworkRequest();
            const response = await fetch(`${baseUrl}/robots.txt`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecurityScanner/1.0)' },
                timeout: 10000,
            });

            if (response.ok) {
                result.raw = await response.text();

                for (const line of result.raw.split('\n')) {
                    const trimmed = line.trim().toLowerCase();

                    if (trimmed.startsWith('disallow:')) {
                        const path = line.split(':').slice(1).join(':').trim();
                        if (path && path !== '/') {
                            result.disallowed.push(path);
                        }
                    } else if (trimmed.startsWith('sitemap:')) {
                        const sitemapUrl = line.split(':').slice(1).join(':').trim();
                        if (sitemapUrl) {
                            result.sitemaps.push(sitemapUrl);
                        }
                    }
                }
            }
        } catch {
            // Ignore errors
        }

        return result;
    }

    async parseSitemap(ctx, url, parsedUrls, depth = 0) {
        if (depth > 3 || parsedUrls.has(url)) return [];
        parsedUrls.add(url);

        const urls = [];

        try {
            ctx.recordNetworkRequest();
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecurityScanner/1.0)' },
                timeout: 15000,
            });

            if (!response.ok) return urls;

            const text = await response.text();

            // Extract <loc> tags (works for both sitemap and sitemap index)
            const locMatches = text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi);
            for (const match of locMatches) {
                const loc = match[1].trim();

                // Check if it's a nested sitemap
                if (loc.endsWith('.xml') || loc.includes('sitemap')) {
                    const nestedUrls = await this.parseSitemap(ctx, loc, parsedUrls, depth + 1);
                    urls.push(...nestedUrls);
                } else {
                    urls.push(loc);
                }
            }

            // Also handle plain text sitemaps
            if (!text.includes('<')) {
                for (const line of text.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('http')) {
                        urls.push(trimmed);
                    }
                }
            }
        } catch {
            // Ignore errors
        }

        return urls;
    }

    isApiPath(path) {
        const apiPatterns = [
            /\/api\//i,
            /\/v\d+\//i,
            /\/graphql/i,
            /\/rest\//i,
            /\/rpc\//i,
            /\/admin/i,
            /\/internal/i,
            /\/private/i,
            /\/backend/i,
            /\/auth/i,
            /\/login/i,
            /\/oauth/i,
            /\/token/i,
            /\/webhook/i,
            /\.json$/i,
        ];

        return apiPatterns.some(pattern => pattern.test(path));
    }
}

export default SitemapAgent;
