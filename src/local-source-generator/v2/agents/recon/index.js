/**
 * Recon Agents - Index
 */

export { NetReconAgent } from './net-recon-agent.js';
export { CrawlerAgent } from './crawler-agent.js';
export { TechFingerprinterAgent } from './tech-fingerprinter-agent.js';
export { JSHarvesterAgent } from './js-harvester-agent.js';
export { APIDiscovererAgent } from './api-discoverer-agent.js';
export { SubdomainHunterAgent } from './subdomain-hunter-agent.js';

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
