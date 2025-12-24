#!/usr/bin/env node

/**
 * Quick test to isolate newline spam source
 */

import cliProgress from 'cli-progress';
import chalk from 'chalk';

// Test multibar behavior
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{bar} | {agent} | {status}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    linewrap: false,
    noTTYOutput: false,
    emptyOnZero: true,
    forceRedraw: false,
    stopOnComplete: true,
}, cliProgress.Presets.shades_grey);

console.log('Starting multibar test...\n');

// Simulate agent runs
const agents = ['Agent1', 'Agent2', 'Agent3'];

for (const agent of agents) {
    const bar = multibar.create(100, 0, {
        agent: chalk.cyan(agent.padEnd(20)),
        status: 'Starting...'
    });

    // Simulate work
    await new Promise(r => setTimeout(r, 100));
    bar.update(50, { agent: chalk.cyan(agent.padEnd(20)), status: 'Working...' });
    await new Promise(r => setTimeout(r, 100));
    bar.update(100, { agent: chalk.cyan(agent.padEnd(20)), status: chalk.green('Success') });
    bar.stop();
}

multibar.stop();
console.log('\n✅ Test complete');
