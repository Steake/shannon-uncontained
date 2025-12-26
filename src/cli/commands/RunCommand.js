
import chalk from 'chalk';
import { path, fs } from 'zx';
import { displaySplashScreen } from '../ui.js';
import { createLSGv2 } from '../../local-source-generator/v2/index.js';
import { checkToolAvailability, handleMissingTools } from '../../tool-checker.js';
import { DomainProfiler } from '../../local-source-generator/v2/adaptation/domain-profiler.js';
import { getLLMClient } from '../../local-source-generator/v2/orchestrator/llm-client.js';

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

    // 2.5 Preflight Checks - LLM availability
    const llm = getLLMClient();
    const llmConfig = llm.getConfig();
    if (!llmConfig.hasApiKey) {
        console.log(chalk.yellow('\n⚠️  LLM API key not configured!'));
        console.log(chalk.gray('   Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or LLM_API_KEY in .env'));
        console.log(chalk.gray('   LLM-enhanced features (architecture docs, security analysis) will be skipped.\n'));
    } else if (!global.SHANNON_QUIET) {
        console.log(chalk.green(`✓ LLM configured: ${llmConfig.provider} (${llmConfig.model})`));
    }

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

        // 6. Execute Pipeline (full or single-agent)
        let result;

        if (options.agent) {
            // Single-agent mode: run only the specified agent
            console.log(chalk.cyan(`\n🎯 Running single agent: ${options.agent}`));
            result = await orchestrator.runSingleAgent(options.agent, target, workspace);

            if (result.success) {
                console.log(chalk.green.bold(`\n✅ Agent ${options.agent} completed successfully!`));
                console.log(chalk.gray(`    World Model: ${path.join(workspace, 'world-model.json')}`));
            } else {
                console.log(chalk.red.bold(`\n❌ Agent ${options.agent} failed`));
                console.log(chalk.red(`    Error: ${result.error}`));
                process.exit(1);
            }

            // Exit cleanly for single-agent mode
            process.exit(0);
        }

        // Full pipeline mode
        result = await orchestrator.runFullPipeline(target, workspace, runOptions);

        if (result.success) {
            console.log(chalk.green.bold('\n🎉 Pipeline Completed Successfully!'));
            console.log(chalk.gray(`    World Model: ${path.join(workspace, 'world-model.json')}`));
            console.log(chalk.gray(`    Execution Log: ${path.join(workspace, 'execution-log.json')}`));

            // Update domain profile for drift detection
            try {
                const profiler = new DomainProfiler({ profileDir: path.join(workspace, 'domain-profiles') });
                await profiler.init();

                const domain = new URL(target).hostname;
                const metrics = {
                    probeSuccessRate: result.stats?.probeSuccessRate || 0,
                    avgClaimConfidence: orchestrator.ledger.stats().avg_belief || 0.5,
                    endpointCount: orchestrator.targetModel.getEndpoints().length,
                    techDistribution: {},
                };

                const profile = await profiler.updateProfile(domain, metrics);

                if (profiler.hasDrifted(domain)) {
                    console.log(chalk.yellow(`    ⚠️ Domain drift detected: ${(profile.drift_score * 100).toFixed(1)}%`));
                } else {
                    console.log(chalk.gray(`    📊 Domain profile updated (drift: ${(profile.drift_score * 100).toFixed(1)}%)`));
                }
            } catch (profileErr) {
                // Domain profiling is optional, continue on error
            }

            // 7. Active Validation (Strategy-based)
            const strategy = options.strategy || 'legacy';

            if (strategy === 'legacy') {
                console.log(chalk.blue(`\n🚀 Executing Strategy: Legacy (Prompt-Based)`));
                try {
                    const { executeGeneratedTests } = await import('../execution-runner.js');
                    // Pass skipRecon from CLI options; reconnaissance runs by default unless --skip-recon is provided
                    const execOptions = { skipRecon: options.skipRecon === true };
                    await executeGeneratedTests(target, workspace, execOptions);
                } catch (e) {
                    console.warn(chalk.yellow(`⚠️  Legacy Pentest failed: ${e.message}`));
                }
            } else if (strategy === 'agentic') {
                console.log(chalk.blue(`\n🤖 Executing Strategy: Agentic (Agent-Based)`));
                console.log(chalk.yellow('🚧 Agentic strategy is under construction. Future agents will run here.'));
                // TODO: Invoke AgentOrchestrator here
            } else {
                console.warn(chalk.red(`⚠️ Unknown strategy: ${strategy}`));
            }

            // Exit cleanly (prevents hanging from open handles like ReactiveVerifier queue)
            process.exit(0);
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

