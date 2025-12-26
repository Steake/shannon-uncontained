
import chalk from 'chalk';
import { fs, path } from 'zx';

export async function evidenceCommand(action, workspace, options) {
    // Load world model from the standard location
    // The world model is exported as `world-model.json` by WorldModel.export()

    if (!await fs.pathExists(workspace)) {
        console.error(chalk.red(`Workspace not found: ${workspace}`));
        process.exit(1);
    }

    console.log(chalk.blue(`Loading Evidence Graph from ${workspace}...`));

    // Load the world model from the standard export format
    const worldModelFile = path.join(workspace, 'world-model.json');
    let data = { evidence: [], claims: [], artifacts: [] };

    if (await fs.pathExists(worldModelFile)) {
        data = await fs.readJSON(worldModelFile);
    } else {
        console.log(chalk.yellow('No world-model.json found, assuming empty workspace.'));
    }

    if (action === 'stats') {
        printStats(data);
    } else if (action === 'export') {
        // TODO
        console.log('Export not implemented yet');
    }
}

function printStats(data) {
    console.log(chalk.bold('\n📊 Evidence Graph Stats'));
    console.log(chalk.gray('─'.repeat(30)));

    // Handle missing or differently-structured data gracefully
    const evidence = data.evidence || [];
    const claims = data.claims || [];
    const artifacts = data.artifacts || [];

    console.log(`Evidence Items:  ${chalk.cyan(evidence.length)}`);
    console.log(`Claims Derived:  ${chalk.green(claims.length)}`);
    console.log(`Artifacts:       ${chalk.yellow(artifacts.length)}`);
    console.log(chalk.gray('─'.repeat(30)));

    // Group by source agent
    const byAgent = {};
    evidence.forEach(e => {
        if (e && e.sourceAgent) {
            byAgent[e.sourceAgent] = (byAgent[e.sourceAgent] || 0) + 1;
        }
    });

    if (Object.keys(byAgent).length > 0) {
        console.log(chalk.bold('\nSources:'));
        Object.entries(byAgent).forEach(([agent, count]) => {
            console.log(`  ${agent}: ${count}`);
        });
    }
}
