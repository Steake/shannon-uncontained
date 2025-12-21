// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';

// Helper function: Display help information
export function showHelp() {
  console.log(chalk.cyan.bold('Shannon Uncontained - AI Penetration Testing Agent'));
  console.log(chalk.gray('Automated security assessment for web applications\n'));

  console.log(chalk.yellow.bold('BLACK-BOX MODE (No Source Code Required):'));
  console.log('  ./shannon.mjs --blackbox <WEB_URL>');
  console.log('  ./shannon.mjs --blackbox <WEB_URL> --config auth.yaml');
  console.log(chalk.gray('  Performs reconnaissance, generates synthetic source, then runs full pentest\n'));

  console.log(chalk.yellow.bold('WHITE-BOX MODE (With Source Code):'));
  console.log('  ./shannon.mjs <WEB_URL> <REPO_PATH>');
  console.log('  ./shannon.mjs <WEB_URL> <REPO_PATH> --config auth.yaml');
  console.log(chalk.gray('  Uses provided source code for in-depth analysis\n'));

  console.log(chalk.yellow.bold('DEVELOPER MODE (Operate on Existing Sessions):'));
  console.log('  ./shannon.mjs --run-phase <phase-name> [--pipeline-testing]');
  console.log('  ./shannon.mjs --run-all [--pipeline-testing]');
  console.log('  ./shannon.mjs --rollback-to <agent-name>');
  console.log('  ./shannon.mjs --rerun <agent-name> [--pipeline-testing]');
  console.log('  ./shannon.mjs --status');
  console.log('  ./shannon.mjs --list-agents');
  console.log('  ./shannon.mjs --cleanup [session-id]\n');

  console.log(chalk.yellow.bold('OPTIONS:'));
  console.log('  --blackbox           Black-box mode - no source code required');
  console.log('  --config <file>      YAML configuration for auth, scope, and rate limits');
  console.log('  --quiet, -q          Minimal output (errors and essential status only)');
  console.log('  --verbose, -v        Detailed output including LLM turns and tool calls');
  console.log('  --pipeline-testing   Use minimal prompts for fast testing');
  console.log('  --disable-loader     Disable animated progress indicator');
  console.log('  --setup-only         Setup session without running agents\n');

  console.log(chalk.yellow.bold('EXAMPLES:'));
  console.log(chalk.gray('  # Black-box scan (just a URL):'));
  console.log('  ./shannon.mjs --blackbox "https://target.com"');
  console.log('  ./shannon.mjs --blackbox "https://target.com" --config auth.yaml\n');

  console.log(chalk.gray('  # White-box scan (with source):'));
  console.log('  ./shannon.mjs "https://target.com" "/path/to/source"');
  console.log('  ./shannon.mjs "https://target.com" "/path/to/source" --config auth.yaml\n');

  console.log(chalk.gray('  # Operate on existing session:'));
  console.log('  ./shannon.mjs --status');
  console.log('  ./shannon.mjs --run-phase exploitation');
  console.log('  ./shannon.mjs --run-all\n');

  console.log(chalk.yellow.bold('BLACK-BOX CAPABILITIES:'));
  console.log('  • Technology fingerprinting (frameworks, CMS, WAF)');
  console.log('  • API discovery (OpenAPI, GraphQL, JS extraction)');
  console.log('  • Shadow IT detection (cloud buckets, dev environments)');
  console.log('  • Vulnerability hypothesis generation');
  console.log('  • Synthetic source code generation for agent analysis\n');

  console.log(chalk.yellow.bold('ENVIRONMENT VARIABLES:'));
  console.log('  GITHUB_TOKEN         GitHub token for LLM API (default provider)');
  console.log('  LLM_PROVIDER         Override: github, openai, ollama, llamacpp');
  console.log('  PENTEST_MAX_RETRIES  Number of retries for AI agents (default: 3)');
}

// Export the splash screen function for use in main
export { displaySplashScreen };