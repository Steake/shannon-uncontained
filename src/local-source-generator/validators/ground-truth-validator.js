/**
 * Ground Truth Validator - Validates LSG output against live HTTP responses
 * Adds reality-based annotations to synthetic pseudo-code
 */

import { fs, path } from 'zx';
import chalk from 'chalk';
import { probeEndpoints, classifyBehavior } from './endpoint-prober.js';

/**
 * Extract routes from generated pseudo-code files
 */
async function extractRoutesFromPseudoCode(sourceDir) {
    const routesDir = path.join(sourceDir, 'routes');
    const routes = [];

    if (!await fs.pathExists(routesDir)) {
        return routes;
    }

    const files = await fs.readdir(routesDir);

    for (const file of files) {
        if (!file.endsWith('.pseudo.js')) continue;

        const filePath = path.join(routesDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Extract route paths from pseudo-code
        // Pattern: // Route: METHOD /path
        const routeMatches = content.matchAll(/\/\/\s*Route:\s*(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/gi);

        for (const match of routeMatches) {
            routes.push({
                method: match[1].toUpperCase(),
                path: match[2],
                file: file,
                filePath
            });
        }

        // Also extract from handler patterns
        // Pattern: app.get('/path', or router.post('/path',
        const handlerMatches = content.matchAll(/(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi);

        for (const match of handlerMatches) {
            routes.push({
                method: match[1].toUpperCase(),
                path: match[2],
                file: file,
                filePath
            });
        }
    }

    // Deduplicate
    const seen = new Set();
    return routes.filter(r => {
        const key = `${r.method}:${r.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Update pseudo-code file with ground-truth annotations
 */
async function annotatePseudoCode(filePath, probeResults) {
    let content = await fs.readFile(filePath, 'utf8');

    // Build annotation block
    const annotations = ['', '// ═══════════════════════════════════════════════════════════════'];
    annotations.push('// GROUND-TRUTH VALIDATION RESULTS');
    annotations.push('// ═══════════════════════════════════════════════════════════════');

    for (const result of probeResults) {
        const behavior = classifyBehavior(result);
        annotations.push(`// ${result.method} ${result.url}`);
        annotations.push(`//   Status: ${result.status} ${result.statusText || ''}`);
        annotations.push(`//   Classification: ${behavior.classification}`);
        annotations.push(`//   Auth Required: ${behavior.authRequired}`);
        annotations.push(`//   Exists: ${behavior.exists}`);
        if (behavior.note) {
            annotations.push(`//   Note: ${behavior.note}`);
        }
        annotations.push('//');
    }

    annotations.push('// ═══════════════════════════════════════════════════════════════');
    annotations.push('');

    // Insert after the file header comment
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd > 0) {
        content = content.slice(0, headerEnd) + annotations.join('\n') + content.slice(headerEnd);
    } else {
        content = annotations.join('\n') + content;
    }

    // Also update individual route comments with OBSERVED behavior
    for (const result of probeResults) {
        const behavior = classifyBehavior(result);
        const routePath = new URL(result.url).pathname;

        // Find route definition and add observation
        const routePattern = new RegExp(
            `(//\\s*Route:\\s*${result.method}\\s+${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
            'i'
        );

        content = content.replace(routePattern, (match) => {
            return `${match}\n// OBSERVED: ${result.status} ${behavior.classification} | Auth: ${behavior.authRequired}`;
        });
    }

    await fs.writeFile(filePath, content);
}

/**
 * Generate validation summary report
 */
function generateValidationSummary(probeResults) {
    const summary = {
        total: probeResults.length,
        accessible: 0,
        protected: 0,
        notFound: 0,
        redirect: 0,
        error: 0,
        unknown: 0,
        falsePositiveLikely: 0
    };

    for (const result of probeResults) {
        const behavior = classifyBehavior(result);

        switch (behavior.classification) {
            case 'ACCESSIBLE':
                summary.accessible++;
                break;
            case 'PROTECTED':
                summary.protected++;
                summary.falsePositiveLikely++; // Assumed no auth but actually protected
                break;
            case 'NOT_FOUND':
                summary.notFound++;
                summary.falsePositiveLikely++; // Endpoint doesn't exist
                break;
            case 'REDIRECT':
                summary.redirect++;
                break;
            case 'ERROR':
                summary.error++;
                break;
            default:
                summary.unknown++;
        }
    }

    return summary;
}

/**
 * Main validation function - called after pseudo-code generation
 */
export async function validateGroundTruth(options) {
    const { sourceDir, webUrl } = options;

    console.log(chalk.cyan('  🔍 Extracting routes from pseudo-code...'));
    const routes = await extractRoutesFromPseudoCode(sourceDir);

    if (routes.length === 0) {
        console.log(chalk.yellow('  ⚠️  No routes found in pseudo-code'));
        return { validated: false, reason: 'No routes found' };
    }

    console.log(chalk.gray(`  Found ${routes.length} routes to validate`));

    // Build endpoint URLs
    const baseUrl = webUrl.replace(/\/$/, '');
    const endpoints = routes.map(r => ({
        url: `${baseUrl}${r.path}`,
        method: r.method,
        route: r
    }));

    console.log(chalk.cyan('  📡 Probing live endpoints...'));
    const probeResults = await probeEndpoints(endpoints);

    // Group results by file for annotation
    const resultsByFile = {};
    for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const result = probeResults[i];

        if (!resultsByFile[route.filePath]) {
            resultsByFile[route.filePath] = [];
        }
        resultsByFile[route.filePath].push(result);
    }

    console.log(chalk.cyan('  📝 Annotating pseudo-code with ground-truth...'));
    for (const [filePath, results] of Object.entries(resultsByFile)) {
        await annotatePseudoCode(filePath, results);
        console.log(chalk.gray(`    Updated: ${path.basename(filePath)}`));
    }

    // Generate and display summary
    const summary = generateValidationSummary(probeResults);

    console.log(chalk.cyan('\n  📊 Ground-Truth Summary:'));
    console.log(chalk.gray('  ─────────────────────────────────'));
    console.log(chalk.green(`    ✓ Accessible (no auth):  ${summary.accessible}`));
    console.log(chalk.yellow(`    🔒 Protected (auth req):  ${summary.protected}`));
    console.log(chalk.red(`    ✗ Not Found (404):        ${summary.notFound}`));
    console.log(chalk.blue(`    → Redirects:              ${summary.redirect}`));
    console.log(chalk.gray(`    ? Unknown/Error:          ${summary.error + summary.unknown}`));
    console.log(chalk.gray('  ─────────────────────────────────'));

    if (summary.falsePositiveLikely > 0) {
        console.log(chalk.yellow(`\n  ⚠️  ${summary.falsePositiveLikely} endpoints may produce false positives`));
        console.log(chalk.gray('     (Protected or non-existent endpoints assumed vulnerable in synthetic code)'));
    }

    // Save validation report
    const reportPath = path.join(sourceDir, 'deliverables', 'ground_truth_validation.json');
    await fs.writeFile(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        webUrl,
        summary,
        probeResults: probeResults.map((r, i) => ({
            ...r,
            route: routes[i].path,
            method: routes[i].method,
            behavior: classifyBehavior(r)
        }))
    }, null, 2));

    console.log(chalk.gray(`\n  Report saved: ${reportPath}`));

    return {
        validated: true,
        summary,
        probeResults
    };
}
