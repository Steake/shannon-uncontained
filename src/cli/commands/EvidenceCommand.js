
import chalk from 'chalk';
import { fs, path } from 'zx';
import { WorldModel } from '../../core/WorldModel.js';

export async function evidenceCommand(action, workspace, options) {
    const wmPath = path.join(workspace, 'evidence.jsonl');

    // In a real implementation this would load from JSONL.
    // For now we assume the standard export format from WorldModel.toJSON()
    // which is a single JSON object in evidence.jsonl (historically named, actually JSON)
    // or we can implement true JSONL streaming loader.

    if (!await fs.pathExists(workspace)) {
        console.error(chalk.red(`Workspace not found: ${workspace}`));
        process.exit(1);
    }

    console.log(chalk.blue(`Loading Evidence Graph from ${workspace}...`));

    // Lazy load mock for now as we don't have the full persistence layer hooked up in RunCommand yet
    // In production this would read `world-model.json`
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
    console.log(`Evidence Items:  ${chalk.cyan(data.evidence.length)}`);
    console.log(`Claims Derived:  ${chalk.green(data.claims.length)}`);
    console.log(`Artifacts:       ${chalk.yellow(data.artifacts.length)}`);
    console.log(chalk.gray('─'.repeat(30)));

    // Group by source agent
    const byAgent = {};
    data.evidence.forEach(e => {
        byAgent[e.sourceAgent] = (byAgent[e.sourceAgent] || 0) + 1;
    });

    console.log(chalk.bold('\nSources:'));
    Object.entries(byAgent).forEach(([agent, count]) => {
        console.log(`  ${agent}: ${count}`);
    });
}
