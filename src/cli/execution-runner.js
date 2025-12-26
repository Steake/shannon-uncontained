import chalk from 'chalk';

/**
 * Execute generated tests against the live target
 * 
 * @param {string} target - Target URL
 * @param {string} workspace - Workspace directory
 * @returns {Promise<object>} Execution results
 */
export async function executeGeneratedTests(target, workspace, options = {}) {

    console.log(chalk.blue(`\n🚀 Handing over to Shannon Pentest System...`));

    try {
        const { runLegacyPentest } = await import('../core/LegacyPentestRunner.js');

        // Run the full Shannon pentest pipeline on the generated source
        // effectively treating the LSG output as the "Done Recon" state if skipRecon is true
        // By default, do not skip recon unless explicitly requested via options.skipRecon
        const result = await runLegacyPentest(target, workspace, {
            disableLoader: false, // Show progress
            skipRecon: options.skipRecon === true,
            // Pass any other config derived from CLI if needed
        });

        if (result.success) {
            console.log(chalk.green('\n✅ Shannon Pentest Execution Complete'));
            return { success: true, ...result };
        } else {
            return { success: false, error: 'Pentest execution failed' };
        }

    } catch (error) {
        console.error(chalk.red(`\n❌ Execution Error: ${error.message}`));
        if (process.env.DEBUG) console.error(error.stack);
        return { success: false, error: error.message };
    }
}
