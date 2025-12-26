#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { program } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { runCommand } from './src/cli/commands/RunCommand.js';
import { evidenceCommand } from './src/cli/commands/EvidenceCommand.js';
import { modelCommand } from './src/cli/commands/ModelCommand.js';

dotenv.config();

program
  .name('shannon')
  .description('AI Penetration Testing Agent - World-Model First Architecture')
  .version('2.0.0');

// GLOBAL OPTIONS
program
  .option('-q, --quiet', 'Suppress output')
  .option('-v, --verbose', 'Verbose output')
  .option('--debug', 'Debug mode');

// RUN COMMAND
program
  .command('run')
  .description('Execute a pentest session against a target')
  .argument('<target>', 'Target URL')
  .option('--mode <mode>', 'Execution mode: live, replay, dry-run', 'live')
  .option('--workspace <dir>', 'Directory for artifacts and evidence')
  .option('--repo-path <path>', 'Path to existing repository (skips black-box recon)')
  .option('--evidence-in <file>', 'Input evidence file for replay')
  .option('--evidence-out <file>', 'Output evidence file')
  .option('--profile <profile>', 'Budget profile: ci, recon-only, full (future feature)', 'full')
  .option('--resume', 'Resume existing session (even if completed)')
  .option('--restore <agent>', 'Restore to specific agent checkpoint')
  .option('--config <file>', 'Path to configuration file')
  .option('--agent <name>', 'Run only a specific agent (e.g., DocumentationAgent)')
  // Budget Options
  .option('--max-time-ms <ms>', 'Max execution time in ms', parseInt)
  .option('--max-tokens <n>', 'Max tokens allowed', parseInt)
  .option('--max-network-requests <n>', 'Max network requests', parseInt)
  .option('--max-tool-invocations <n>', 'Max tool invocations', parseInt)
  .option('--skip-recon', 'Skip Shannon reconnaissance phase (starts at Phase 3)')
  .option('--strategy <type>', 'Execution strategy: legacy (prompt-based) or agentic (agent-based)', 'legacy')
  .action(async (target, options) => {
    // Set global flags
    global.SHANNON_QUIET = options.quiet || program.opts().quiet;
    global.SHANNON_VERBOSE = options.verbose || program.opts().verbose;

    await runCommand(target, options);
  });

// EVIDENCE COMMAND
const evidenceCmd = program
  .command('evidence')
  .description('Manage and query the Evidence Graph');

evidenceCmd
  .command('stats')
  .description('Show statistics for the evidence graph')
  .argument('<workspace>', 'Workspace directory')
  .action(async (workspace) => {
    await evidenceCommand('stats', workspace);
  });

// MODEL COMMAND
const modelCmd = program
  .command('model')
  .description('Introspect the Target Model');

modelCmd
  .command('why')
  .argument('<claim_id>', 'ID of the claim/entity to explain')
  .option('--workspace <dir>', 'Workspace directory', '.')
  .action(async (claimId, options) => {
    await modelCommand('why', claimId, options);
  });

modelCmd
  .command('show')
  .description('Visualize the world model with charts and graphs')
  .option('--workspace <dir>', 'Workspace directory', '.')
  .action(async (options) => {
    await modelCommand('show', null, options);
  });

modelCmd
  .command('graph')
  .description('Display ASCII knowledge graph')
  .option('--workspace <dir>', 'Workspace directory', '.')
  .action(async (options) => {
    await modelCommand('graph', null, options);
  });

modelCmd
  .command('export-html')
  .description('Export interactive D3.js node graph to HTML file')
  .option('--workspace <dir>', 'Workspace directory', '.')
  .option('-o, --output <file>', 'Output file path')
  .option('--view <mode>', 'Graph view mode: topology, evidence, provenance', 'topology')
  .action(async (options) => {
    await modelCommand('export-html', null, options);
  });

// GENERATE COMMAND (Local Source Generator)
program
  .command('generate')
  .description('Generate synthetic local source from black-box reconnaissance')
  .argument('<target>', 'Target URL')
  .option('-o, --output <dir>', 'Output directory', './shannon-results')
  .option('--skip-nmap', 'Skip nmap port scan')
  .option('--skip-crawl', 'Skip active crawling')
  .option('--timeout <ms>', 'Global timeout for tools in ms', parseInt)
  .option('--no-ai', 'Skip AI-powered code synthesis (recon only)')
  .option('--framework <name>', 'Target framework for synthesis (express, fastapi)', 'express')
  .option('--no-msf', 'Disable Metasploit integration')
  .option('--msf-host <host>', 'Metasploit RPC host')
  .option('--msf-port <port>', 'Metasploit RPC port', parseInt)
  .option('--msf-user <user>', 'Metasploit RPC user')
  .option('--msf-pass <pass>', 'Metasploit RPC password')
  .option('-p, --parallel <number>', 'Max parallel agents', '4')
  .option('-v, --verbose', 'Verbose output')
  .action(async (target, options) => {
    const { generateLocalSource } = await import('./local-source-generator.mjs');

    console.log(chalk.cyan.bold('🔍 LOCAL SOURCE GENERATOR'));
    console.log(chalk.gray(`Target: ${target}`));
    console.log(chalk.gray(`Output: ${options.output}`));
    console.log(chalk.gray(`AI Synthesis: ${options.ai !== false ? 'enabled' : 'disabled'}`));

    try {
      const result = await generateLocalSource(target, options.output, {
        skipNmap: options.skipNmap,
        skipCrawl: options.skipCrawl,
        timeout: options.timeout,
        enableAI: options.ai !== false,
        framework: options.framework,
        noMsf: !options.msf, // Configured via --no-msf
        msfHost: options.msfHost,
        msfPort: options.msfPort,
        msfUser: options.msfUser,
        msfPass: options.msfPass,
        parallel: parseInt(options.parallel),
        verbose: options.verbose
      });
      console.log(chalk.green(`\n✅ Local source generated at: ${result}`));
    } catch (error) {
      console.error(chalk.red(`\n❌ Generation failed: ${error.message}`));
      process.exit(1);
    }
  });

// SYNTHESIZE COMMAND (Run AI synthesis on existing world model)
program
  .command('synthesize')
  .alias('synthesise')
  .description('Run AI synthesis on an existing world model (resume/retry)')
  .argument('<workspace>', 'Workspace directory containing world-model.json')
  .option('-f, --framework <framework>', 'Target framework (express/fastapi)', 'express')
  .option('-p, --parallel <number>', 'Max parallel agents', '4')
  .option('--verbose', 'Verbose output')
  .action(async (workspace, options) => {
    console.log(chalk.magenta.bold('🤖 AI SYNTHESIS'));
    console.log(chalk.gray(`Workspace: ${workspace}`));
    console.log(chalk.gray(`Framework: ${options.framework}`));

    try {
      const { fs, path } = await import('zx');

      // Find world-model.json
      const worldModelPath = path.join(workspace, 'world-model.json');
      if (!await fs.pathExists(worldModelPath)) {
        throw new Error(`World model not found: ${worldModelPath}`);
      }

      const worldModelData = JSON.parse(await fs.readFile(worldModelPath, 'utf-8'));
      console.log(chalk.gray(`  Evidence: ${worldModelData.evidence?.length || 0}`));
      console.log(chalk.gray(`  Claims: ${worldModelData.claims?.length || 0}`));

      // Import v2 Orchestrator
      const { createLSGv2 } = await import('./src/local-source-generator/v2/index.js');
      const orchestrator = createLSGv2({ mode: 'live' });

      // Add event listeners for debugging
      orchestrator.on('synthesis:model-ready', (data) => {
        console.log(chalk.gray(`  Endpoints: ${data.endpoints}`));
        console.log(chalk.gray(`  Entities: ${data.total_entities}`));
      });
      orchestrator.on('synthesis:agent-complete', (data) => {
        const icon = data.success ? '✅' : '⚠️';
        console.log(chalk.gray(`  ${icon} ${data.agent}`));
      });

      // Run synthesis
      console.log(chalk.blue('\n🔧 Running synthesis agents...'));
      const result = await orchestrator.runSynthesis(
        worldModelData,
        workspace,
        {
          framework: options.framework,
          verbose: options.verbose,
          parallel: parseInt(options.parallel, 10),
          noMsf: options.noMsf
        }
      );


      if (result.success) {
        console.log(chalk.green(`\n✅ Synthesis complete`));
        console.log(chalk.gray(`   Files: ${result.files_generated?.length || 0}`));
      } else {
        console.log(chalk.yellow('\n⚠️ Some agents failed:'));
        for (const err of result.errors || []) {
          console.log(chalk.red(`   - ${err.agent}: ${err.error}`));
        }
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Synthesis failed: ${error.message}`));
      process.exit(1);
    }
  });

// OSINT COMMAND GROUP
const osintCmd = program
  .command('osint')
  .description('Open Source Intelligence gathering');

osintCmd
  .command('email <email>')
  .description('Gather intelligence on an email address')
  .option('--no-breaches', 'Skip HaveIBeenPwned breach lookup')
  .option('--no-social', 'Skip social account discovery')
  .option('--json', 'Output as JSON')
  .option('-o, --output <file>', 'Save results to file')
  .action(async (email, options) => {
    let EmailOSINTAgent, EvidenceGraph, EpistemicLedger, AgentContext, fs;

    try {
      ({ EmailOSINTAgent } = await import('./src/local-source-generator/v2/agents/recon/email-osint-agent.js'));
      ({ EvidenceGraph } = await import('./src/local-source-generator/v2/worldmodel/evidence-graph.js'));
      ({ EpistemicLedger } = await import('./src/core/EpistemicLedger.js'));
      ({ AgentContext } = await import('./src/local-source-generator/v2/agents/base-agent.js'));
      ({ fs } = await import('zx'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to load OSINT dependencies.'));
      console.error(chalk.red('Please ensure all required packages are installed by running: npm install'));
      console.error(chalk.red(`Details: ${error.message}`));
      // Check for verbose flag from global options
      if (program.opts().verbose && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }

    if (!options.json) {
      console.log(chalk.cyan.bold('🔍 EMAIL OSINT'));
      console.log(chalk.gray(`Target: ${email}`));
      console.log('');
    }

    try {
      // Create minimal context for standalone agent run
      const evidenceGraph = new EvidenceGraph();
      const ledger = new EpistemicLedger();

      const ctx = new AgentContext({
        evidenceGraph,
        ledger,
        targetModel: null,
        manifest: null,
        config: {},
        budget: { max_time_ms: 60000, max_network_requests: 20 },
      });

      // Run agent
      const agent = new EmailOSINTAgent();
      const result = await agent.execute(ctx, {
        email,
        include_breaches: options.breaches !== false,
        include_social: options.social !== false,
      });

      if (!result.success) {
        console.error(chalk.red(`❌ Error: ${result.error}`));
        process.exit(1);
      }

      const data = result.outputs;

      // Output results
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(chalk.bold('📧 Email:'), data.email);
        console.log(chalk.bold('🌐 Domain:'), data.domain);
        console.log('');

        // MX Records
        if (data.mx_records.length > 0) {
          console.log(chalk.bold.blue('📬 MX Records:'));
          for (const mx of data.mx_records) {
            console.log(`   ${mx}`);
          }
          console.log('');
        }

        // Reputation
        if (data.reputation.reputation) {
          const reputation = data.reputation.reputation;
          let coloredReputation;
          if (reputation === 'high') {
            coloredReputation = chalk.green(reputation);
          } else if (reputation === 'medium') {
            coloredReputation = chalk.yellow(reputation);
          } else {
            coloredReputation = chalk.red(reputation);
          }
          console.log(chalk.bold.blue('⭐ Reputation:'), coloredReputation);
          if (data.reputation.suspicious) {
            console.log(chalk.yellow('   ⚠️  Suspicious activity detected'));
          }
          if (data.reputation.profiles?.length > 0) {
            console.log(`   Profiles: ${data.reputation.profiles.join(', ')}`);
          }
          console.log('');
        }

        // Breaches
        if (data.breaches.length > 0) {
          console.log(chalk.bold.red(`🔓 Breaches (${data.breaches.length}):`));
          for (const breach of data.breaches) {
            console.log(`   ${chalk.yellow(breach.name)} - ${breach.breach_date}`);
            if (breach.data_classes?.length > 0) {
              console.log(chalk.gray(`      Data: ${breach.data_classes.slice(0, 5).join(', ')}`));
            }
          }
          console.log('');
        } else if (data.sources_queried.includes('haveibeenpwned')) {
          console.log(chalk.green('✅ No breaches found'));
          console.log('');
        }

        // Social Accounts
        if (data.social_accounts.length > 0) {
          console.log(chalk.bold.blue(`👤 Social Accounts (${data.social_accounts.length}):`));
          for (const account of data.social_accounts) {
            console.log(`   ${account.service}`);
          }
          console.log('');
        }

        // Domain Info (Hunter.io)
        if (data.domain_info.status) {
          console.log(chalk.bold.blue('🏢 Domain Info:'));
          console.log(`   Status: ${data.domain_info.status}`);
          if (data.domain_info.company) console.log(`   Company: ${data.domain_info.company}`);
          if (data.domain_info.first_name) console.log(`   Name: ${data.domain_info.first_name} ${data.domain_info.last_name || ''}`);
          console.log('');
        }

        console.log(chalk.gray(`Sources: ${data.sources_queried.join(', ')}`));
      }

      // Save to file if requested
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(data, null, 2));
        if (!options.json) {
          console.log(chalk.green(`\n✅ Results saved to: ${options.output}`));
        }
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

program.parse();