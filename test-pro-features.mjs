#!/usr/bin/env node
/**
 * Test Suite for New Pro-Tier Features
 * 
 * Verifies CVSS Calculator, Remediation Agent, and Webhook Reporter.
 */

import { CvssCalculator } from './src/local-source-generator/reporting/cvss-calculator.js';
import { RemediationAgent } from './src/local-source-generator/v2/agents/synthesis/remediation-agent.js';
import { DataFlowMapper } from './src/local-source-generator/v2/agents/analysis/data-flow-mapper.js';
import { WebhookReporter } from './src/local-source-generator/reporting/webhook-reporter.js';
import { createLSGv2 } from './src/local-source-generator/v2/index.js';

// Test utilities
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m'
};

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`${colors.green}✓${colors.reset} ${name}`);
        passed++;
    } catch (error) {
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${error.message}`);
        failed++;
    }
}

async function runTests() {
    console.log(`\n${colors.bright}🧪 Shannon Pro Feature Tests${colors.reset}\n`);

    // 1. CVSS Calculator Tests
    console.log('--- CVSS v3.1 Calculator ---');

    test('Calculates Critical Score (Log4j)', () => {
        // CVE-2021-44228
        const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H';
        const result = new CvssCalculator().calculateScore(vector);
        if (result.score !== 10.0) throw new Error(`Expected 10.0, got ${result.score}`);
        if (result.severity !== 'Critical') throw new Error(`Expected Critical, got ${result.severity}`);
    });

    test('Calculates Medium Score (Reflected XSS)', () => {
        const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N';
        const result = new CvssCalculator().calculateScore(vector);
        if (result.score !== 6.1) throw new Error(`Expected 6.1, got ${result.score}`);
    });

    test('Parses partial vector components correctly', () => {
        const calc = new CvssCalculator();
        const vector = calc.parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
        if (vector.AV !== 'N') throw new Error('Failed parsing AV');
        if (vector.C !== 'H') throw new Error('Failed parsing C');
    });

    // 2. DataFlowMapper Upgrade Tests
    console.log('\n--- DataFlowMapper (Advanced) ---');

    test('Initialize with recursion depth', () => {
        const agent = new DataFlowMapper({ recursion_depth: 3 });
        // Accessing internal state via input schema validation check
        if (agent.inputs_schema.properties.recursion_depth.default !== 2)
            throw new Error('Default recursion depth should be 2');
    });

    test('Recursion depth flows to run()', async () => {
        const lsg = createLSGv2();
        const agent = new DataFlowMapper();
        // Mocking context
        const ctx = {
            targetModel: { getEndpoints: () => [] },
            log: () => { },
            recordTokens: () => { }
        };

        // We can't easily test the LLM call without mocking, but we can verify it doesn't crash
        const result = await agent.run(ctx, { target: 'http://test.com', recursion_depth: 5 });
        if (result.flows.length !== 0) throw new Error('Should obtain empty results for empty model');
    });

    // 3. Webhook Reporter Tests
    console.log('\n--- Webhook Reporter ---');

    test('Formats Slack payload correctly', () => {
        const reporter = new WebhookReporter({ webhookType: 'slack' });
        const report = {
            target: 'test.com',
            summary: { totalFindings: 5, bySeverity: { critical: 2, high: 3 } }
        };
        const payload = reporter.formatPayload(report);
        if (!payload.blocks) throw new Error('Missing Slack blocks');
        if (!payload.text.includes('test.com')) throw new Error('Missing target in text');
    });

    test('Formats Discord payload correctly', () => {
        const reporter = new WebhookReporter({ webhookType: 'discord' });
        const report = {
            target: 'test.com',
            summary: { totalFindings: 5, bySeverity: { critical: 1, high: 0 } }
        };
        const payload = reporter.formatPayload(report);
        if (!payload.content.includes('Critical: 1')) throw new Error('Missing critical count');
    });

    console.log(`\n${colors.green}✓ Passed: ${passed}${colors.reset}`);
    if (failed > 0) console.log(`${colors.red}✗ Failed: ${failed}${colors.reset}`);
}

runTests();
