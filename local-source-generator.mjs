#!/usr/bin/env node

/**
 * Local Source Generator v2 - Full Pipeline Entry Point
 * 
 * Runs the complete LSGv2 pipeline with all 27 agents:
 * - Recon: NetRecon, Subdomain, TechFingerprint, Crawler, JSHarvest, API, Content, Secrets, WAF
 * - Analysis: Architect, Auth, DataFlow, Business, VulnHypothesis, SecurityHeader, TLS
 * - Exploitation: Nuclei, SQLmap, XSS, CommandInjection
 * - Synthesis: GroundTruth, Source, Schema, Test, Documentation
 */

import { $ } from 'zx';
import { fs, path, which } from 'zx';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import 'dotenv/config'; // Ensure env vars are loaded even if run directly

// Silence zx globally to prevent command output spam
$.quiet = true;
$.verbose = false;

// Import LSGv2
import { createLSGv2, Orchestrator } from './src/local-source-generator/v2/index.js';
import { runPreflight, printPreflightResults } from './src/local-source-generator/v2/tools/preflight.js';
import { validateUrl } from './src/local-source-generator/utils/resilience.js';

/**
 * Main generator function - runs full v2 pipeline
 */
export async function generateLocalSource(webUrl, outputDir, options = {}) {
    console.log(chalk.yellow.bold('\n🔍 LOCAL SOURCE GENERATOR v2'));

    // Validate URL
    let parsedUrl;
    try {
        parsedUrl = validateUrl(webUrl);
        console.log(chalk.green(`  ✅ Target URL validated: ${parsedUrl.hostname}`));
    } catch (error) {
        console.error(chalk.red(`  ❌ ${error.message}`));
        throw error;
    }

    const targetDomain = parsedUrl.hostname;
    const sourceDir = path.join(outputDir, 'repos', targetDomain);

    // Create output directories
    await fs.ensureDir(sourceDir);
    await fs.ensureDir(path.join(sourceDir, 'routes'));
    await fs.ensureDir(path.join(sourceDir, 'models'));
    await fs.ensureDir(path.join(sourceDir, 'config'));
    await fs.ensureDir(path.join(sourceDir, 'deliverables'));

    // Run tool preflight check
    console.log(chalk.blue('\n🔧 Checking tool availability...'));
    const preflightResults = await runPreflight({ requiredOnly: false });

    if (!options.quiet) {
        // Show available tools
        // Show available tools (ALL of them, per user request)
        for (const tool of preflightResults.available) {
            console.log(chalk.green(`  ✅ ${tool.padEnd(20)} - available`));
        }
        if (preflightResults.missing.filter(m => m.required).length > 0) {
            console.log(chalk.yellow(`  ⚠️  Missing required: ${preflightResults.missing.filter(m => m.required).map(m => m.name).join(', ')}`));
        }
    }

    // Create orchestrator with all agents
    console.log(chalk.magenta('\n🚀 Initializing LSGv2 Pipeline...'));
    const orchestrator = createLSGv2({
        mode: 'live',
        maxParallel: options.parallel || 4,
        enableCaching: true,
        streamDeltas: true,
    });

    // Simple progress - no multibar (avoids terminal newline issues)
    const completedAgents = new Set();

    // Stage Start
    orchestrator.on('stage:start', ({ stage }) => {
        if (!options.quiet) console.log(chalk.bold.blue(`\n⚡ Stage: ${stage.toUpperCase()}`));
    });

    // Agent Start
    orchestrator.on('agent:start', ({ agent }) => {
        if (options.verbose && !options.quiet) {
            console.log(chalk.gray(`  ▶ ${agent}`));
        }
    });

    // Agent Complete
    orchestrator.on('agent:complete', ({ agent, result }) => {
        if (!options.quiet) {
            const icon = result.success ? chalk.green('✓') : chalk.red('✗');
            const status = result.success ? '' : ` - ${result.error || 'Failed'}`;
            console.log(`  ${icon} ${agent}${status}`);
        }
        completedAgents.add(agent);
    });

    orchestrator.on('stage:complete', ({ stage, errors }) => {
        // Stage complete - no action needed
    });

    // Run full pipeline
    try {
        const msfrpcConfig = options.noMsf ? null : {
            host: options.msfHost || '127.0.0.1',
            port: options.msfPort || 55553,
            user: options.msfUser || 'msf',
            password: options.msfPass || 'msf',
            autoStart: true
        };

        // Quiet mode handled in event listeners

        const result = await orchestrator.runFullPipeline(webUrl, sourceDir, {
            framework: options.framework || 'express',
            msfrpcConfig, // Pass to all agents in inputs
            excludeAgents: options.noMsf ? ['MetasploitRecon', 'MetasploitExploit'] : [],
            quiet: !options.verbose // Silence agents unless verbose
        });



        // Print summary
        console.log(chalk.green('\n✅ Pipeline Complete'));
        console.log(chalk.cyan('   Summary:'));

        const stats = orchestrator.stats();
        console.log(chalk.gray(`   - Agents executed: ${orchestrator.executionLog.length}`));
        console.log(chalk.gray(`   - Evidence events: ${stats.evidence_stats.by_type ? Object.values(stats.evidence_stats.by_type).reduce((a, b) => a + b, 0) : 0}`));
        console.log(chalk.gray(`   - Claims generated: ${stats.ledger_stats.total_claims || 0}`));
        console.log(chalk.gray(`   - Entities in model: ${stats.model_stats.total_entities || 0}`));

        // Show stage results
        if (result.stages) {
            console.log(chalk.cyan('\n   By Stage:'));
            for (const [stage, stageResult] of Object.entries(result.stages)) {
                const agentCount = Object.keys(stageResult.results || {}).length;
                const errorCount = stageResult.errors?.length || 0;
                const icon = stageResult.success ? '✅' : '⚠️';
                console.log(chalk.gray(`   ${icon} ${stage}: ${agentCount} agents, ${errorCount} errors`));
            }
        }

        console.log(chalk.green(`\n   Output: ${sourceDir}`));
        console.log(chalk.gray(`   World model: ${path.join(sourceDir, 'world-model.json')}`));

        return sourceDir;
    } catch (error) {

        console.error(chalk.red(`\n❌ Pipeline failed: ${error.message}`));
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        // process.exit(0); // Let node exit naturally or force if needed
        setTimeout(() => process.exit(0), 100);
    }
}

// CLI help
function printHelp() {
    console.log(`
${chalk.bold('Local Source Generator v2')}
Full LSGv2 pipeline with all 27 agents for comprehensive black-box reconnaissance.

${chalk.bold('Usage:')}
  ./local-source-generator.mjs <url> [options]

${chalk.bold('Options:')}
  --help, -h        Show this help message
  --output, -o      Output directory (default: ./shannon-results)
  --framework, -f   Target framework: express, fastapi (default: express)
  --parallel, -p    Max parallel agents (default: 4)
  --verbose, -v     Show detailed agent output
  --quiet, -q       Suppress non-essential output

${chalk.bold('Metasploit Options:')}
  --no-msf          Disable Metasploit integration
  --msf-host        RPC host (default: 127.0.0.1)
  --msf-port        RPC port (default: 55553)
  --msf-user        RPC user (default: msf)
  --msf-pass        RPC password (default: msf)

${chalk.bold('Pipeline Stages:')}
  1. Recon       - 9 agents (nmap, subfinder, crawler, etc.)
  2. Analysis    - 7 agents (architecture, auth, vuln hypothesis, etc.)
  3. Exploitation- 4 agents (nuclei, sqlmap, xss, cmdi)
  4. Synthesis   - 5 agents (source gen, schema, tests, docs)

${chalk.bold('Examples:')}
  ./local-source-generator.mjs https://example.com
  ./local-source-generator.mjs https://target.com -o ./audit -v
  ./local-source-generator.mjs https://api.target.com -f fastapi
`);
}

// Main execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);

    // Parse arguments
    const options = {
        help: args.includes('--help') || args.includes('-h'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        quiet: args.includes('--quiet') || args.includes('-q'),
    };

    // Find output flag
    const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
    if (outputIdx !== -1 && args[outputIdx + 1]) {
        options.output = args[outputIdx + 1];
    }

    // Find framework flag
    const frameworkIdx = args.findIndex(a => a === '--framework' || a === '-f');
    if (frameworkIdx !== -1 && args[frameworkIdx + 1]) {
        options.framework = args[frameworkIdx + 1];
    }

    // Find parallel flag
    const parallelIdx = args.findIndex(a => a === '--parallel' || a === '-p');
    if (parallelIdx !== -1 && args[parallelIdx + 1]) {
        options.parallel = parseInt(args[parallelIdx + 1]);
    }

    // Metasploit Flags
    const msfHostIdx = args.indexOf('--msf-host');
    if (msfHostIdx !== -1 && args[msfHostIdx + 1]) options.msfHost = args[msfHostIdx + 1];

    const msfPortIdx = args.indexOf('--msf-port');
    if (msfPortIdx !== -1 && args[msfPortIdx + 1]) options.msfPort = parseInt(args[msfPortIdx + 1]);

    const msfUserIdx = args.indexOf('--msf-user');
    if (msfUserIdx !== -1 && args[msfUserIdx + 1]) options.msfUser = args[msfUserIdx + 1];

    const msfPassIdx = args.indexOf('--msf-pass');
    if (msfPassIdx !== -1 && args[msfPassIdx + 1]) options.msfPass = args[msfPassIdx + 1];

    if (args.includes('--no-msf')) options.noMsf = true;

    if (options.help) {
        printHelp();
        process.exit(0);
    }

    // Get URL (first non-flag argument)
    const webUrl = args.find(a => !a.startsWith('-') && a !== options.output && a !== options.framework && a !== String(options.parallel));
    const outputDir = options.output || './shannon-results';

    if (!webUrl) {
        console.error(chalk.red('Error: URL argument is required.'));
        printHelp();
        process.exit(1);
    }

    try {
        await generateLocalSource(webUrl, outputDir, options);
    } catch (error) {
        console.error(chalk.red('\n❌ Generation failed:'), error.message);
        process.exit(1);
    }
}