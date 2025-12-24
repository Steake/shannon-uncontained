// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

// Check availability of required tools
export const checkToolAvailability = async () => {
  const tools = ['nmap', 'subfinder', 'whatweb', 'schemathesis'];
  const availability = {};

  console.log(chalk.blue('🔧 Checking tool availability...'));

  for (const tool of tools) {
    try {
      await $`command -v ${tool}`;
      availability[tool] = true;
      console.log(chalk.green(`  ✅ ${tool} - available`));
    } catch {
      availability[tool] = false;
      console.log(chalk.yellow(`  ⚠️ ${tool} - not found`));
    }
  }

  // Check LLM API keys
  checkLLMApiKeys();

  return availability;
};

// Check LLM API key configuration
export const checkLLMApiKeys = () => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const llmKey = process.env.LLM_API_KEY;

  const hasKey = !!(anthropicKey || openaiKey || llmKey);

  if (!hasKey) {
    console.log(chalk.yellow('\n' + '⚠️'.repeat(20)));
    console.log(chalk.yellow.bold('  ⚠️  WARNING: No LLM API key configured!'));
    console.log(chalk.yellow('     AI-powered synthesis will be DISABLED.'));
    console.log(chalk.yellow('     Generated code quality will be significantly degraded.'));
    console.log(chalk.gray('\n     Set one of the following environment variables:'));
    console.log(chalk.gray('       export ANTHROPIC_API_KEY=sk-...'));
    console.log(chalk.gray('       export OPENAI_API_KEY=sk-...'));
    console.log(chalk.gray('       export LLM_API_KEY=...'));
    console.log(chalk.yellow('⚠️'.repeat(20) + '\n'));
    return false;
  } else {
    const provider = anthropicKey ? 'Anthropic' : (openaiKey ? 'OpenAI' : 'Custom');
    console.log(chalk.green(`  ✅ LLM API key configured (${provider})`));
    return true;
  }
};

// Handle missing tools with user-friendly messages
export const handleMissingTools = (toolAvailability) => {
  const missing = Object.entries(toolAvailability)
    .filter(([tool, available]) => !available)
    .map(([tool]) => tool);

  if (missing.length > 0) {
    console.log(chalk.yellow(`\n⚠️ Missing tools: ${missing.join(', ')}`));
    console.log(chalk.gray('Some functionality will be limited. Install missing tools for full capability.'));

    // Provide installation hints
    const installHints = {
      'nmap': 'brew install nmap (macOS) or apt install nmap (Ubuntu)',
      'subfinder': 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
      'whatweb': 'gem install whatweb',
      'schemathesis': 'pip install schemathesis'
    };

    console.log(chalk.gray('\nInstallation hints:'));
    missing.forEach(tool => {
      if (installHints[tool]) {
        console.log(chalk.gray(`  ${tool}: ${installHints[tool]}`));
      }
    });
    console.log('');
  }

  return missing;
};
