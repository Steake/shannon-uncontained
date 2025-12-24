/**
 * BrowserCrawlerAgent - Stealth browser-based crawling for WAF bypass
 * 
 * Uses Playwright with stealth techniques to crawl WAF-protected sites.
 * Intercepts network requests to discover API endpoints.
 */

import { BaseAgent } from '../base-agent.js';
import { EVENT_TYPES, createEvidenceEvent } from '../../worldmodel/evidence-graph.js';
import { FeatureCollector } from '../../ml/feature-collector.js';
import { Cortex } from '../../ml/cortex.js';
import { path } from 'zx';

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

        // Initialize Feature Collector
        const outputDir = inputs.outputDir || ctx.config?.outputDir || process.cwd();
        const featureCollector = new FeatureCollector(outputDir);
        await featureCollector.init();

        // Initialize Cortex
        const cortex = new Cortex();
        await cortex.init();

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

            page.on('response', async response => {
                const request = response.request();
                const url = response.url();
                const method = request.method();
                const resourceType = request.resourceType();
                const status = response.status();

                if (resourceType === 'xhr' || resourceType === 'fetch') {
                    try {
                        const parsed = new URL(url);
                        const path = parsed.pathname + parsed.search;
                        const key = `${method}:${path}`;

                        // NOISE FILTERING via Cortex
                        const prediction = cortex.predictFilter(url, path);
                        const isNoise = prediction.label === 'noise';

                        if (!isNoise && !discoveredEndpoints.has(key)) {
                            discoveredEndpoints.add(key);

                            // Capture Bodies if JSON
                            let requestBody = request.postData(); // String or null
                            let responseBody = null;
                            const contentType = response.headers()['content-type'] || '';

                            if (contentType.includes('application/json')) {
                                try {
                                    responseBody = await response.json();
                                } catch {
                                    // Ignore body parse errors
                                }
                            }

                            // Store Payloads as Blobs
                            const blobRefs = [];
                            if (requestBody) {
                                blobRefs.push(ctx.evidenceGraph.storeBlob(requestBody, 'application/json')); // Assuming JSON/Text
                            }
                            if (responseBody) {
                                blobRefs.push(ctx.evidenceGraph.storeBlob(JSON.stringify(responseBody), 'application/json'));
                            }

                            xhrRequests.push({ method, url, path, resourceType, status });

                            ctx.emitEvidence(createEvidenceEvent({
                                source: this.name,
                                event_type: EVENT_TYPES.ENDPOINT_DISCOVERED,
                                target,
                                payload: {
                                    method,
                                    path,
                                    url,
                                    source: 'browser_xhr',
                                    has_request_body: !!requestBody,
                                    has_response_body: !!responseBody
                                },
                                blob_refs: blobRefs
                            }));
                            results.endpoints_discovered++;
                        }

                        // Log to Feature Collector (Silver Labeling)
                        featureCollector.logFilterData({
                            url,
                            path,
                            method,
                            resourceType,
                            contentType: response.headers()['content-type'],
                            contentLength: response.headers()['content-length'],
                            // Labels
                            heuristic_label: isNoise ? 'noise' : 'signal',
                            prediction_score: prediction.score,
                            prediction_model: prediction.model
                        });

                    } catch (err) {
                        // Ignore processing errors
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
            if (this.featureCollector) {
                await this.featureCollector.close();
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
