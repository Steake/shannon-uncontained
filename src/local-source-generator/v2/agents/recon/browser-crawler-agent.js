/**
 * BrowserCrawlerAgent - Stealth browser-based crawling for WAF bypass
 * 
 * Uses Playwright with stealth techniques to crawl WAF-protected sites.
 * Intercepts network requests to discover API endpoints.
 */

import { BaseAgent } from '../base-agent.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';

export class BrowserCrawlerAgent extends BaseAgent {
    constructor(options = {}) {
        super('BrowserCrawlerAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target'],
            properties: {
                target: { type: 'string', description: 'Target URL' },
                maxPages: { type: 'number', description: 'Maximum pages to crawl (default: 10)' },
                timeout: { type: 'number', description: 'Page timeout in ms (default: 30000)' },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                pages_crawled: { type: 'number' },
                endpoints_discovered: { type: 'number' },
                xhr_requests: { type: 'array' },
            },
        };

        this.requires = { evidence_kinds: [], model_nodes: [] };
        this.emits = {
            evidence_events: [EVENT_TYPES.ENDPOINT_DISCOVERED, 'browser_crawl'],
            model_updates: [],
            claims: [],
            artifacts: [],
        };

        this.default_budget = {
            max_time_ms: 180000,
            max_network_requests: 500,
            max_tokens: 0,
            max_tool_invocations: 0,
        };
    }

    async run(ctx, inputs) {
        const { target, maxPages = 10, timeout = 30000 } = inputs;

        const results = {
            pages_crawled: 0,
            endpoints_discovered: 0,
            xhr_requests: [],
            errors: [],
        };

        // Check if Playwright is available
        let playwright;
        try {
            playwright = await import('playwright');
        } catch (e) {
            this.setStatus('Playwright not installed - skipping browser crawl');
            results.errors.push('Playwright not installed. Run: npm install playwright');
            return results;
        }

        this.setStatus('Launching stealth browser...');

        let browser;
        try {
            // Launch with stealth settings
            browser = await playwright.chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                ],
            });

            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                locale: 'en-US',
                timezoneId: 'America/New_York',
                javaScriptEnabled: true,
            });

            // Set extra headers for stealth
            await context.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
            });

            const page = await context.newPage();

            // Intercept XHR/fetch requests
            const discoveredEndpoints = new Set();
            const xhrRequests = [];

            page.on('request', request => {
                const url = request.url();
                const method = request.method();
                const resourceType = request.resourceType();

                // Capture XHR/fetch requests
                if (resourceType === 'xhr' || resourceType === 'fetch') {
                    try {
                        const parsed = new URL(url);
                        const path = parsed.pathname + parsed.search;
                        const key = `${method}:${path}`;

                        if (!discoveredEndpoints.has(key)) {
                            discoveredEndpoints.add(key);
                            xhrRequests.push({
                                method,
                                url,
                                path,
                                resourceType,
                            });

                            // Emit endpoint evidence
                            ctx.emitEvidence({
                                source: this.name,
                                event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                                target,
                                payload: {
                                    method,
                                    path,
                                    url,
                                    source: 'browser_xhr',
                                },
                            });
                            results.endpoints_discovered++;
                        }
                    } catch {
                        // Invalid URL
                    }
                }
            });

            // Navigate to target
            this.setStatus(`Navigating to ${target}...`);
            try {
                await page.goto(target, {
                    waitUntil: 'networkidle',
                    timeout,
                });
                results.pages_crawled++;
            } catch (e) {
                results.errors.push(`Navigation failed: ${e.message}`);
            }

            // Wait for dynamic content
            await page.waitForTimeout(2000);

            // Scroll to trigger lazy loading
            await this.scrollPage(page);

            // Extract links for additional pages
            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => href.startsWith(window.location.origin));
            });

            const baseUrl = new URL(target).origin;
            const visitedUrls = new Set([target]);

            // Visit additional pages
            for (const link of links.slice(0, maxPages - 1)) {
                if (visitedUrls.has(link)) continue;
                visitedUrls.add(link);

                try {
                    this.setStatus(`Crawling ${visitedUrls.size}/${maxPages}: ${link.slice(0, 50)}...`);
                    await page.goto(link, {
                        waitUntil: 'networkidle',
                        timeout: timeout / 2,
                    });
                    results.pages_crawled++;
                    await page.waitForTimeout(1000);
                    await this.scrollPage(page);
                } catch {
                    // Skip failed pages
                }
            }

            results.xhr_requests = xhrRequests;

            // Emit browser crawl summary
            ctx.emitEvidence({
                source: this.name,
                event_type: 'browser_crawl',
                target,
                payload: {
                    pages_crawled: results.pages_crawled,
                    endpoints_discovered: results.endpoints_discovered,
                    xhr_count: xhrRequests.length,
                },
            });

        } catch (e) {
            results.errors.push(`Browser error: ${e.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }

        this.setStatus(`Crawled ${results.pages_crawled} pages, found ${results.endpoints_discovered} endpoints`);
        return results;
    }

    async scrollPage(page) {
        try {
            await page.evaluate(async () => {
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                const height = document.body.scrollHeight;
                const step = Math.floor(height / 5);

                for (let i = 0; i < 5; i++) {
                    window.scrollTo(0, step * (i + 1));
                    await delay(300);
                }
                window.scrollTo(0, 0);
            });
        } catch {
            // Ignore scroll errors
        }
    }
}

export default BrowserCrawlerAgent;
