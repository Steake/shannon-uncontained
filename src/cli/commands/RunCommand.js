
import chalk from 'chalk';
import { path, fs } from 'zx';
import { displaySplashScreen } from '../ui.js';
import { createSession, getNextAgent, AGENTS } from '../../session-manager.js';
import { setupLocalRepo } from '../../setup/environment.js';
import { checkToolAvailability, handleMissingTools } from '../../tool-checker.js';
import { generateLocalSource } from '../../../local-source-generator.mjs';
import { WorldModel } from '../../core/WorldModel.js';
import { BudgetManager } from '../../core/BudgetManager.js';
import { EpistemicLedger } from '../../core/EpistemicLedger.js';

// Import orchestration logic (preserving existing imports)
import { runPhase, rollbackTo } from '../../checkpoint-manager.js';
import { runClaudePromptWithRetry } from '../../ai/claude-executor.js';
import { loadPrompt } from '../../prompts/prompt-manager.js';
import { executePreReconPhase } from '../../phases/pre-recon.js';
import { assembleFinalReport } from '../../phases/reporting.js';
import { logError } from '../../error-handling.js';
import { parseConfig, distributeConfig } from '../../config-parser.js';


export async function runCommand(target, options) {
    // 1. Initialize Budgets
    const budget = new BudgetManager({
        maxTimeMs: options.maxTimeMs,
        maxTokens: options.maxTokens,
        maxNetworkRequests: options.maxNetworkRequests,
        maxToolInvocations: options.maxToolInvocations
    });

    // 2. Setup Workspace & World Model
    const workspace = options.workspace || path.join(process.cwd(), 'workspaces', new URL(target).hostname);
    await fs.ensureDir(workspace);

    const worldModel = new WorldModel(workspace);
    await worldModel.init();

    // Note: EpistemicLedger will be integrated in future phases for uncertainty tracking
    // eslint-disable-next-line no-unused-vars
    const ledger = new EpistemicLedger();

    // 3. Display Info
    if (!global.SHANNON_QUIET) {
        await displaySplashScreen();
        console.log(chalk.cyan.bold('🚀 WORLD-MODEL FIRST CLI'));
        console.log(chalk.gray(`Target: ${target}`));
        console.log(chalk.gray(`Mode: ${options.mode}`));
        console.log(chalk.gray(`Workspace: ${workspace}`));

        // Budget profile will be used to configure different limit presets
        if (options.budgetProfile) {
            console.log(chalk.gray(`Profile: ${options.budgetProfile} (budget presets coming soon)`));
        }
    }

    // 4. Handle DRY RUN
    if (options.mode === 'dry-run') {
        console.log(chalk.yellow('\n[DRY-RUN] Execution Plan:'));
        console.log('1. Initialize Workspace');
        console.log('2. Check Tools');
        console.log('3. Run Agents (Pre-Recon -> Report)');
        console.log('4. Generate Artifacts');
        return;
    }

    // 5. Normal Execution Logic (Adapted from old main())
    try {
        // Tool Check
        const toolAvailability = await checkToolAvailability();
        handleMissingTools(toolAvailability);

        // Config Loading
        let config = null;
        let distributedConfig = null;
        if (options.config) {
            config = await parseConfig(options.config);
            distributedConfig = distributeConfig(config);
        }

        // Repo/Blackbox Setup
        let repoPath = options.repoPath; // If passed explicitly via --repo-path
        let isBlackbox = !repoPath;

        if (isBlackbox) {
            console.log(chalk.magenta('🕵️  Black-box mode: Generating local source...'));
            try {
                // Check budget before expensive operation
                budget.check();

                repoPath = await generateLocalSource(target, workspace); // Use workspace as base for repos

                // Track the network requests made during generation
                budget.track('networkRequests', 5); // Approximate count for recon tools
            } catch (e) {
                console.error(chalk.red(`Failed to generate local source: ${e.message}`));
                process.exit(1);
            }
        }

        // Git Setup
        const sourceDir = await setupLocalRepo(repoPath);

        // Session Creation
        // We attach the WorldModel reference to the session if possible, 
        // or just pass it down to agents.
        const session = await createSession(target, repoPath, options.config, sourceDir, options.resume || !!options.restore);

        // Mark session as blackbox mode for conditional prompt loading
        session.isBlackbox = isBlackbox;

        // Handle Restore Request
        if (options.restore) {
            await rollbackTo(options.restore, session);
        }

        // EXECUTION LOOP
        // Pass worldModel and budget to the phase runners
        // (Note: This requires updating the phase runners to accept these new objects, 
        //  but for now we wrap existing logic and inject where we can).

        // Re-using the exact logic from old main() to ensure stability
        // but mapping the options correctly.

        await executePipeline(target, sourceDir, session, distributedConfig, toolAvailability, options, worldModel, workspace, budget);

    } catch (error) {
        if (error.name === 'BudgetExceededError') {
            console.log(chalk.red.bold(`\n💸 BUDGET EXCEEDED: ${error.message}`));
        } else {
            await logError(error, 'Run Command');
            console.log(chalk.red(`\n❌ Error: ${error.message}`));
        }
        process.exit(1);
    }
}

// Extracted Pipeline Logic
async function executePipeline(webUrl, sourceDir, session, distributedConfig, toolAvailability, options, worldModel, workspace, budget) {
    const pipelineTestingMode = options.pipelineTesting;
    const variables = { webUrl, repoPath: sourceDir, sourceDir }; // Fix repoPath mapping

    // Start Phase determining logic...
    const nextAgent = getNextAgent(session);
    if (!nextAgent) {
        console.log(chalk.green('Session already completed.'));
        return;
    }

    // START PHASES

    // Phase 1: Pre-Recon
    if (AGENTS['pre-recon'].order >= nextAgent.order) {
        // Evidence collection hook
        await executePreReconPhase(webUrl, sourceDir, variables, distributedConfig, toolAvailability, pipelineTestingMode, session.id);

        // Add phase completion to world model
        worldModel.addEvidence({ type: 'phase_complete', phase: 'pre-recon' }, 'pre-recon');
        budget.track('toolInvocations', 1);

        await updateSessionWithProgress(session, 'pre-recon');
    }

    // Quick hack to chain the rest of the phases since they are monolithic in the old file
    // In a full refactor, `runPhase` should take the worldModel and budget.

    if (nextAgent.order <= 2) {
        // Recon
        // Pass full session object (not just {id}) so AuditSession can access webUrl
        await runClaudePromptWithRetry(await loadPrompt('recon', variables, distributedConfig, pipelineTestingMode), sourceDir, '*', '', 'Recon', 'recon', chalk.cyan, session);
        budget.track('toolInvocations', 1);
        await updateSessionWithProgress(session, 'recon');
    }


    if (nextAgent.order <= 7 && nextAgent.order >= 3) {
        await runPhase('vulnerability-analysis', session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
        budget.track('toolInvocations', 1);
    }

    if (nextAgent.order <= 12 && nextAgent.order >= 8) {
        await runPhase('exploitation', session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
        budget.track('toolInvocations', 1);
    }

    if (nextAgent.order <= 13) {
        await assembleFinalReport(sourceDir);
        await runClaudePromptWithRetry(await loadPrompt('report-executive', variables, distributedConfig, pipelineTestingMode), sourceDir, '*', '', 'Report', 'report', chalk.cyan, session);
        budget.track('toolInvocations', 1);
        await updateSessionWithProgress(session, 'report');
    }

    // Save World Model at end (best-effort; do not crash pipeline if this fails)
    try {
        await worldModel.export('world-model.json');
    } catch (error) {
        const exportPath = path.join(workspace, 'world-model.json');
        console.warn(
            chalk.yellow(
                `Warning: Failed to export world model to "${exportPath}". The pipeline completed, but evidence export may be incomplete.`
            )
        );
        console.warn(chalk.yellow(`World model export error: ${error.stack || error.message || String(error)}`));
    }
}

async function updateSessionWithProgress(session, agentName) {
    const { updateSession } = await import('../../session-manager.js');
    const updates = {
        completedAgents: [...new Set([...session.completedAgents, agentName])],
        status: 'in-progress'
    };
    await updateSession(session.id, updates);
    Object.assign(session, updates);
}
