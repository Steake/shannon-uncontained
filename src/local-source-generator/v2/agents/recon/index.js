/**
 * Recon Agents - Index
 */

import { NetReconAgent } from './net-recon-agent.js';
import { CrawlerAgent } from './crawler-agent.js';
import { TechFingerprinterAgent } from './tech-fingerprinter-agent.js';
import { JSHarvesterAgent } from './js-harvester-agent.js';
import { APIDiscovererAgent } from './api-discoverer-agent.js';
import { SubdomainHunterAgent } from './subdomain-hunter-agent.js';
import { ContentDiscoveryAgent } from './content-discovery-agent.js';
import { SecretScannerAgent } from './secret-scanner-agent.js';
import { WAFDetector } from './waf-detector-agent.js';
import { OpenAPIDiscoveryAgent } from './openapi-discovery-agent.js';
import { SitemapAgent } from './sitemap-agent.js';
import { CORSProbeAgent } from './cors-probe-agent.js';
import { BrowserCrawlerAgent } from './browser-crawler-agent.js';
import { EmailOSINTAgent } from './email-osint-agent.js';

export {
    NetReconAgent,
    CrawlerAgent,
    TechFingerprinterAgent,
    JSHarvesterAgent,
    APIDiscovererAgent,
    SubdomainHunterAgent,
    ContentDiscoveryAgent,
    SecretScannerAgent,
    WAFDetector,
    OpenAPIDiscoveryAgent,
    SitemapAgent,
    CORSProbeAgent,
    BrowserCrawlerAgent,
    EmailOSINTAgent,
};

/**
 * Register all recon agents with orchestrator
 * @param {Orchestrator} orchestrator - Orchestrator instance
 */
export function registerReconAgents(orchestrator) {
    orchestrator.registerAgent(new OpenAPIDiscoveryAgent()); // API spec detection
    orchestrator.registerAgent(new SitemapAgent());          // Sitemap mining
    orchestrator.registerAgent(new NetReconAgent());
    orchestrator.registerAgent(new CrawlerAgent());
    orchestrator.registerAgent(new TechFingerprinterAgent());
    orchestrator.registerAgent(new JSHarvesterAgent());
    orchestrator.registerAgent(new APIDiscovererAgent());
    orchestrator.registerAgent(new SubdomainHunterAgent());
    orchestrator.registerAgent(new ContentDiscoveryAgent());
    orchestrator.registerAgent(new SecretScannerAgent());
    orchestrator.registerAgent(new WAFDetector());
    orchestrator.registerAgent(new CORSProbeAgent());        // CORS method discovery
    orchestrator.registerAgent(new BrowserCrawlerAgent());   // Stealth browser crawl
    orchestrator.registerAgent(new EmailOSINTAgent());       // Email OSINT
}
