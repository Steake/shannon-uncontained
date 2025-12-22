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
  .option('--config <file>', 'Path to configuration file')
  // Budget Options
  .option('--max-time-ms <ms>', 'Max execution time in ms', parseInt)
  .option('--max-tokens <n>', 'Max tokens allowed', parseInt)
  .option('--max-network-requests <n>', 'Max network requests', parseInt)
  .option('--max-tool-invocations <n>', 'Max tool invocations', parseInt)
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
      });
      console.log(chalk.green(`\n✅ Local source generated at: ${result}`));
    } catch (error) {
      console.error(chalk.red(`\n❌ Generation failed: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();