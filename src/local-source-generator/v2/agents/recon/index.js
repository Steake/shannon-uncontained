/**
 * Recon Agents - Index
 */

import { NetReconAgent } from './net-recon-agent.js';
import { CrawlerAgent } from './crawler-agent.js';
import { TechFingerprinterAgent } from './tech-fingerprinter-agent.js';
import { JSHarvesterAgent } from './js-harvester-agent.js';
import { APIDiscovererAgent } from './api-discoverer-agent.js';
import { SubdomainHunterAgent } from './subdomain-hunter-agent.js';

export { NetReconAgent, CrawlerAgent, TechFingerprinterAgent, JSHarvesterAgent, APIDiscovererAgent, SubdomainHunterAgent };

/**
 * Register all recon agents with orchestrator
 * @param {Orchestrator} orchestrator - Orchestrator instance
 */
export function registerReconAgents(orchestrator) {
    orchestrator.registerAgent(new NetReconAgent());
    orchestrator.registerAgent(new CrawlerAgent());
    orchestrator.registerAgent(new TechFingerprinterAgent());
    orchestrator.registerAgent(new JSHarvesterAgent());
    orchestrator.registerAgent(new APIDiscovererAgent());
    orchestrator.registerAgent(new SubdomainHunterAgent());
}

