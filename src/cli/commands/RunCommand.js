
import chalk from 'chalk';
import { path, fs } from 'zx';
import { displaySplashScreen } from '../ui.js';
import { createLSGv2 } from '../../local-source-generator/v2/index.js';
import { checkToolAvailability, handleMissingTools } from '../../tool-checker.js';

export async function runCommand(target, options) {
    // 1. Display Info
    if (!global.SHANNON_QUIET) {
        await displaySplashScreen();
        console.log(chalk.cyan.bold('🚀 WORLD-MODEL FIRST CLI (LSGv2)'));
        console.log(chalk.gray(`Target: ${target}`));
        console.log(chalk.gray(`Mode: ${options.mode}`));
    }

    // 2. Setup Workspace
    const workspace = options.workspace || path.join(process.cwd(), 'workspaces', new URL(target).hostname);
    await fs.ensureDir(workspace);

    // 3. Handle Dry Run
    if (options.mode === 'dry-run') {
        console.log(chalk.yellow('\n[DRY-RUN] Execution Plan (LSGv2):'));
        console.log('1. Initialize Workspace');
        console.log('2. Check Tools (Preflight)');
        console.log('3. Run Full Pipeline:');
        console.log('   - Recon (9 agents)');
        console.log('   - Analysis (7 agents)');
        console.log('   - Exploitation (5 agents)');
        console.log('   - Synthesis (5 agents)');
        return;
    }

    try {
        // 4. Initialize LSG v2 Orchestrator
        console.log(chalk.blue(`\nInitializing Orchestrator in ${workspace}...`));

        // Pass CLI options to Orchestrator config
        const { orchestrator } = createLSGv2({
            workspace,
            mode: options.mode,
            budget: {
                max_time_ms: options.maxTimeMs,
                max_tokens: options.maxTokens,
                max_network_requests: options.maxNetworkRequests,
                max_tool_invocations: options.maxToolInvocations
            },
            // Map generic CLI flags to config
            enableCaching: true,
            streamDeltas: true
        });

        // 5. Execute Pipeline
        // Map 'run' command options to pipeline inputs
        const runOptions = {
            framework: 'express', // Default, could be inferred or flagged
            resume: options.resume !== false, // Resume by default for 'run', unless --no-resume
            // Metasploit config placeholders (run command might need to expose these flags too if not already)
        };

        // Attach event listeners for CLI feedback
        orchestrator.on('agent:start', ({ agent }) => {
            console.log(chalk.blue(`\n▶️  Starting agent: ${agent}`));
        });

        orchestrator.on('agent:complete', ({ agent, result }) => {
            if (result.success) {
                console.log(chalk.green(`✅ Agent ${agent} completed`));
            } else {
                console.log(chalk.red(`❌ Agent ${agent} failed: ${result.error}`));
            }
        });

        orchestrator.on('agent:skip', ({ agent, reason }) => {
            console.log(chalk.gray(`⏭️  Skipping agent: ${agent} (${reason})`));
        });

        orchestrator.on('resumed', ({ completed, agents }) => {
            console.log(chalk.green(`\n🔄 Session Resumed: Skipping ${completed} completed agents`));
            if (global.SHANNON_VERBOSE) {
                console.log(chalk.gray(`   Skipped: ${agents.join(', ')}`));
            }
        });

        const result = await orchestrator.runFullPipeline(target, workspace, runOptions);

        if (result.success) {
            console.log(chalk.green.bold('\n🎉 Pipeline Completed Successfully!'));
            console.log(chalk.gray(`    World Model: ${path.join(workspace, 'world-model.json')}`));
            console.log(chalk.gray(`    Execution Log: ${path.join(workspace, 'execution-log.json')}`));
        } else {
            console.log(chalk.red.bold('\n❌ Pipeline Failed'));
            process.exit(1);
        }

    } catch (error) {
        console.error(chalk.red(`\n❌ Fatal Error: ${error.message}`));
        if (global.SHANNON_VERBOSE) console.error(error.stack);
        process.exit(1);
    }
}

