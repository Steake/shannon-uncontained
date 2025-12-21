#!/usr/bin/env node
/**
 * LSG v2 Test Runner
 * 
 * Demonstrates LSG v2 capabilities against a target URL.
 * 
 * Usage:
 *   node test-lsg-v2.mjs <target_url> [output_dir]
 */

import {
    createLSGv2,
    Orchestrator,
    PipelineStage,
} from './index.js';

// Colors for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(color, ...args) {
    console.log(color, ...args, colors.reset);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
${colors.bright}LSG v2 Test Runner${colors.reset}

Usage:
  node test-lsg-v2.mjs <target_url> [output_dir]

Examples:
  node test-lsg-v2.mjs https://jsonplaceholder.typicode.com
  node test-lsg-v2.mjs https://httpbin.org ./output
`);
        process.exit(1);
    }

    const target = args[0];
    const outputDir = args[1] || './lsg-v2-output';

    log(colors.bright, '\n🚀 LSG v2 Test Runner\n');
    log(colors.cyan, `Target: ${target}`);
    log(colors.cyan, `Output: ${outputDir}\n`);

    // Create orchestrator
    log(colors.yellow, '📦 Creating orchestrator with all agents...');
    const lsg = createLSGv2({
        mode: 'live',
        maxParallel: 2,
        enableCaching: true,
        streamDeltas: true,
    });

    log(colors.green, `✅ Registered ${lsg.registry.list().length} agents:`);
    for (const agent of lsg.registry.list()) {
        console.log(`   - ${agent}`);
    }

    // Set up event listeners
    lsg.on('agent:start', ({ agent }) => {
        log(colors.blue, `   🔧 Starting: ${agent}`);
    });

    lsg.on('agent:complete', ({ agent, result }) => {
        const status = result.success ? '✅' : '❌';
        log(colors.green, `   ${status} Completed: ${agent} (${result.summary?.duration_ms || 0}ms)`);
    });

    lsg.on('stage:start', ({ stage }) => {
        log(colors.magenta, `\n📍 Stage: ${stage}`);
    });

    lsg.on('delta:evidence', (event) => {
        log(colors.cyan, `   📝 Evidence: ${event.event_type} [${event.source}]`);
    });

    // Define a lightweight test pipeline (skip tools that may not be installed)
    const testPipeline = [
        new PipelineStage('recon', [
            'CrawlerAgent',
            'APIDiscovererAgent',
            'JSHarvesterAgent',
        ], { parallel: true }),

        new PipelineStage('analysis', [
            'ArchitectInferAgent',
            'AuthFlowAnalyzer',
        ], { parallel: false, required: false }),
    ];

    // Execute
    log(colors.yellow, '\n🔄 Executing pipeline...\n');

    const startTime = Date.now();

    try {
        const result = await lsg.executePipeline(testPipeline, { target });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        log(colors.bright, `\n📊 Results (${duration}s)\n`);

        // Show stats
        console.log('Model Stats:');
        console.log(`  Endpoints: ${result.model_stats?.endpoints || 0}`);
        console.log(`  Entities: ${result.model_stats?.entities || 0}`);
        console.log(`  Edges: ${result.model_stats?.edges || 0}`);

        console.log('\nLedger Stats:');
        console.log(`  Claims: ${result.ledger_stats?.total_claims || 0}`);
        console.log(`  Avg Belief: ${((result.ledger_stats?.avg_belief || 0) * 100).toFixed(1)}%`);
        console.log(`  Avg Uncertainty: ${((result.ledger_stats?.avg_uncertainty || 0) * 100).toFixed(1)}%`);

        console.log('\nEvidence Graph:');
        const evidenceStats = lsg.evidenceGraph.stats();
        console.log(`  Events: ${evidenceStats.total_events}`);
        console.log(`  By Type: ${JSON.stringify(evidenceStats.by_type)}`);

        // Show discovered endpoints
        const endpoints = lsg.targetModel.getEndpoints();
        if (endpoints.length > 0) {
            log(colors.green, `\n📌 Discovered Endpoints (${endpoints.length}):\n`);
            for (const ep of endpoints.slice(0, 20)) {
                console.log(`  ${ep.attributes.method || 'GET'} ${ep.attributes.path}`);
            }
            if (endpoints.length > 20) {
                console.log(`  ... and ${endpoints.length - 20} more`);
            }
        }

        // Export state
        log(colors.yellow, '\n💾 Exporting state...');
        const { fs } = await import('zx');
        await fs.mkdir(outputDir, { recursive: true });

        const state = lsg.exportState();
        await fs.writeFile(
            `${outputDir}/lsg-state.json`,
            JSON.stringify(state, null, 2)
        );
        log(colors.green, `✅ State saved to ${outputDir}/lsg-state.json`);

        // Summary
        log(colors.bright, '\n✨ Test Complete!\n');

    } catch (error) {
        log(colors.yellow, `\n⚠️ Error: ${error.message}`);
        console.error(error.stack);
    }
}

main().catch(console.error);
