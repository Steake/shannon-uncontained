
import chalk from 'chalk';
import { fs, path } from 'zx';

export async function modelCommand(action, arg, options) {
    const workspace = options.workspace || '.';
    const worldModelFile = path.join(workspace, 'world-model.json');

    if (!await fs.pathExists(worldModelFile)) {
        console.error(chalk.red(`No world model found at ${worldModelFile}`));
        process.exit(1);
    }

    const data = await fs.readJSON(worldModelFile);

    switch (action) {
        case 'why':
            explainClaim(arg, data);
            break;
        case 'show':
            showModelVisualization(data, options);
            break;
        case 'graph':
            showGraph(data);
            break;
        case 'export-html':
            await exportHtmlGraph(data, options);
            break;
        default:
            console.log(chalk.red(`Unknown action: ${action}`));
    }
}

function explainClaim(claimId, data) {
    const claim = data.claims.find(c => c.id === claimId || c.subject === claimId);

    if (!claim) {
        console.log(chalk.red(`Claim '${claimId}' not found.`));
        return;
    }

    console.log(chalk.bold(`\n🧐 Explanation for Claim: ${claim.id}`));
    console.log(`Subject:   ${chalk.cyan(claim.subject)}`);
    console.log(`Predicate: ${chalk.yellow(claim.predicate)}`);
    console.log(`Object:    ${chalk.green(JSON.stringify(claim.object))}`);
    console.log(`Confidence: ${renderConfidenceBar(claim.confidence)}`);

    console.log(chalk.bold('\nBased on Evidence:'));
    claim.evidenceIds.forEach(eid => {
        const ev = data.evidence.find(e => e.id === eid);
        if (ev) {
            console.log(`  - [${ev.id.substring(0, 8)}] (${ev.sourceAgent}) ${JSON.stringify(ev.content).substring(0, 60)}...`);
        } else {
            console.log(`  - [${eid}] (Missing evidence data)`);
        }
    });
}

function showModelVisualization(data, options) {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║              🌐 WORLD MODEL VISUALIZATION                    ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

    // Summary Stats
    console.log(chalk.bold('📊 Summary'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`  Evidence Items:  ${chalk.cyan(data.evidence?.length || 0)}`);
    console.log(`  Claims:          ${chalk.green(data.claims?.length || 0)}`);
    console.log(`  Artifacts:       ${chalk.yellow(data.artifacts?.length || 0)}`);
    console.log(`  Relations:       ${chalk.magenta(data.relations?.length || 0)}`);
    console.log();

    // Evidence by Agent Chart
    if (data.evidence?.length > 0) {
        console.log(chalk.bold('📈 Evidence by Agent'));
        console.log(chalk.gray('─'.repeat(50)));
        const byAgent = {};
        data.evidence.forEach(e => {
            byAgent[e.sourceAgent] = (byAgent[e.sourceAgent] || 0) + 1;
        });
        renderBarChart(byAgent);
        console.log();
    }

    // Confidence Distribution
    if (data.claims?.length > 0) {
        console.log(chalk.bold('🎯 Claim Confidence Distribution'));
        console.log(chalk.gray('─'.repeat(50)));
        const buckets = { 'High (0.8-1.0)': 0, 'Medium (0.5-0.8)': 0, 'Low (0-0.5)': 0 };
        data.claims.forEach(c => {
            if (c.confidence >= 0.8) buckets['High (0.8-1.0)']++;
            else if (c.confidence >= 0.5) buckets['Medium (0.5-0.8)']++;
            else buckets['Low (0-0.5)']++;
        });
        renderBarChart(buckets);
        console.log();
    }

    // Top Claims
    if (data.claims?.length > 0) {
        console.log(chalk.bold('🔝 Top Claims by Confidence'));
        console.log(chalk.gray('─'.repeat(50)));
        const sorted = [...data.claims].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
        sorted.forEach((c, i) => {
            console.log(`  ${i + 1}. ${renderConfidenceBar(c.confidence)} ${chalk.cyan(c.subject)} ${chalk.gray(c.predicate)}`);
        });
        console.log();
    }

    // Artifact Types
    if (data.artifacts?.length > 0) {
        console.log(chalk.bold('📦 Artifacts by Type'));
        console.log(chalk.gray('─'.repeat(50)));
        const byType = {};
        data.artifacts.forEach(a => {
            byType[a.artifactType] = (byType[a.artifactType] || 0) + 1;
        });
        renderBarChart(byType);
    }
}

function showGraph(data) {
    console.log(chalk.bold.cyan('\n🕸️  KNOWLEDGE GRAPH (ASCII)\n'));

    if (!data.relations || data.relations.length === 0) {
        console.log(chalk.gray('  No relations in the model yet.'));
        return;
    }

    // Build adjacency for visualization
    const nodes = new Set();
    data.relations.forEach(r => {
        nodes.add(r.source);
        nodes.add(r.target);
    });

    console.log(chalk.gray(`  Nodes: ${nodes.size} | Edges: ${data.relations.length}\n`));

    // Simple ASCII representation
    data.relations.slice(0, 15).forEach(r => {
        const srcLabel = r.source.substring(0, 8);
        const tgtLabel = r.target.substring(0, 8);
        console.log(`  [${chalk.cyan(srcLabel)}] ──${chalk.yellow(r.type)}──▶ [${chalk.green(tgtLabel)}]`);
    });

    if (data.relations.length > 15) {
        console.log(chalk.gray(`  ... and ${data.relations.length - 15} more relations`));
    }
}

// Helper: Render ASCII bar chart
function renderBarChart(data) {
    const max = Math.max(...Object.values(data), 1);
    const barWidth = 30;

    Object.entries(data).forEach(([label, value]) => {
        const filled = Math.round((value / max) * barWidth);
        const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(barWidth - filled));
        console.log(`  ${label.padEnd(18)} ${bar} ${value}`);
    });
}

// Helper: Render confidence as a colored bar
function renderConfidenceBar(confidence) {
    const width = 10;
    const filled = Math.round(confidence * width);
    let color = chalk.red;
    if (confidence >= 0.8) color = chalk.green;
    else if (confidence >= 0.5) color = chalk.yellow;

    const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(width - filled));
    return `${bar} ${(confidence * 100).toFixed(0)}%`;
}

async function exportHtmlGraph(data, options) {
    const outputPath = options.output || path.join(options.workspace || '.', 'graph.html');
    const viewMode = options.view || 'topology';

    console.log(chalk.cyan(`  View mode: ${viewMode}`));

    let nodes, links;

    switch (viewMode) {
        case 'evidence':
            ({ nodes, links } = buildEvidenceGraph(data));
            break;
        case 'provenance':
            ({ nodes, links } = buildProvenanceGraph(data));
            break;
        case 'topology':
        default:
            ({ nodes, links } = buildTopologyGraph(data));
            break;
    }

    const html = generateGraphHtml(nodes, links, data, viewMode);
    await fs.writeFile(outputPath, html);

    console.log(chalk.green(`\n✅ Interactive graph exported to: ${outputPath}`));
    console.log(chalk.gray(`   Nodes: ${nodes.length}, Links: ${links.length}`));
    console.log(chalk.gray(`   Open in browser: file://${path.resolve(outputPath)}`));
}

// === GRAPH BUILDERS ===

function buildTopologyGraph(data) {
    const nodesMap = new Map();
    const links = [];

    // === BUILD A REAL NETWORK TOPOLOGY ===

    // 1. Create DOMAIN hub nodes from subdomains in evidence
    const subdomainEvidence = data.evidence?.find(e => e.content?.tool === 'subfinder');
    const subdomains = subdomainEvidence?.content?.subdomains || [];

    // Extract unique base subdomains (e.g., "api", "auth", "dashboard")
    const domainHubs = new Map();
    subdomains.forEach(sub => {
        const prefix = sub.split('.')[0]; // Get first part like "api", "auth"
        if (!domainHubs.has(prefix)) {
            domainHubs.set(prefix, {
                id: `hub_${prefix}`,
                label: prefix,
                type: 'domain',
                fullDomain: sub,
                eqbsl: { b: 0.6, d: 0.1, u: 0.3, a: 0.5 }
            });
        }
    });

    // Add domain hubs as nodes
    domainHubs.forEach((node, key) => nodesMap.set(node.id, node));

    // 2. Create PATH CATEGORY nodes from endpoint patterns
    const pathCategories = new Map();
    data.evidence?.filter(e => e.content?.type === 'endpoint').forEach(e => {
        const path = e.content?.path || '/';
        const parts = path.split('/').filter(p => p && !p.includes('.') && !p.includes('%'));

        // Create category for first path segment
        if (parts.length > 0) {
            const category = parts[0];
            if (!pathCategories.has(category)) {
                pathCategories.set(category, {
                    id: `path_${category}`,
                    label: `/${category}`,
                    type: 'pathCategory',
                    count: 0,
                    eqbsl: { b: 0.5, d: 0.15, u: 0.35, a: 0.5 }
                });
            }
            pathCategories.get(category).count++;
        }
    });

    // Only keep categories with multiple endpoints
    pathCategories.forEach((node, key) => {
        if (node.count >= 3) {
            nodesMap.set(node.id, node);
        }
    });

    // 3. Create TOOL nodes for reconnaissance tools
    const toolNodes = ['nmap', 'subfinder', 'whatweb'].map(tool => ({
        id: `tool_${tool}`,
        label: tool.toUpperCase(),
        type: 'tool',
        eqbsl: { b: 0.8, d: 0.05, u: 0.15, a: 0.5 }
    }));
    toolNodes.forEach(n => nodesMap.set(n.id, n));

    // 4. Create connections: Tools → Domain hubs (discovered by)
    domainHubs.forEach((hub, prefix) => {
        links.push({
            source: 'tool_subfinder',
            target: hub.id,
            type: 'discovered',
            eqbsl: { b: 0.7, d: 0.1, u: 0.2, a: 0.5 }
        });
    });

    // 5. Connect domain hubs to path categories based on endpoint sources
    data.evidence?.filter(e => e.content?.type === 'endpoint').slice(0, 500).forEach(e => {
        const source = e.content?.source || '';
        const path = e.content?.path || '/';
        const parts = path.split('/').filter(p => p && !p.includes('.') && !p.includes('%'));

        if (parts.length > 0) {
            const category = `path_${parts[0]}`;

            // Find which subdomain this endpoint belongs to
            for (const [prefix, hub] of domainHubs) {
                if (source.includes(`${prefix}.`) || source.includes(`${prefix}-`)) {
                    if (nodesMap.has(category)) {
                        // Add link if it doesn't exist
                        const linkKey = `${hub.id}->${category}`;
                        if (!links.find(l => `${l.source}->${l.target}` === linkKey)) {
                            links.push({
                                source: hub.id,
                                target: category,
                                type: 'hosts',
                                eqbsl: { b: 0.6, d: 0.1, u: 0.3, a: 0.5 }
                            });
                        }
                    }
                    break;
                }
            }
        }
    });

    // 6. Connect path categories that share structure
    const categories = Array.from(pathCategories.values()).filter(c => c.count >= 3);
    for (let i = 0; i < categories.length; i++) {
        for (let j = i + 1; j < categories.length; j++) {
            // Connect if both have high count (related areas)
            if (categories[i].count > 5 && categories[j].count > 5) {
                links.push({
                    source: categories[i].id,
                    target: categories[j].id,
                    type: 'related',
                    eqbsl: { b: 0.3, d: 0.2, u: 0.5, a: 0.5 }
                });
            }
        }
    }

    // 7. Add port/service nodes from nmap
    const nmapEvidence = data.evidence?.find(e => e.content?.tool === 'nmap');
    if (nmapEvidence) {
        const nmapResult = nmapEvidence.content?.result || '';
        const ports = nmapResult.match(/(\d+)\/tcp\s+open\s+(\S+)/g) || [];

        ports.forEach(portLine => {
            const match = portLine.match(/(\d+)\/tcp\s+open\s+(\S+)/);
            if (match) {
                const [, port, service] = match;
                const portNode = {
                    id: `port_${port}`,
                    label: `${port}/${service}`,
                    type: 'port',
                    eqbsl: { b: 0.9, d: 0.02, u: 0.08, a: 0.5 }
                };
                nodesMap.set(portNode.id, portNode);
                links.push({
                    source: 'tool_nmap',
                    target: portNode.id,
                    type: 'discovered',
                    eqbsl: { b: 0.95, d: 0.01, u: 0.04, a: 0.5 }
                });
            }
        });
    }

    // Calculate EQBSL properties for all links
    links.forEach(link => {
        const eqbsl = link.eqbsl || { b: 0.5, d: 0.2, u: 0.3, a: 0.5 };
        link.expectation = eqbsl.b + (eqbsl.a * eqbsl.u);
        link.controversy = eqbsl.b * eqbsl.d;
        link.uncertainty = eqbsl.u;
    });

    return { nodes: Array.from(nodesMap.values()), links };
}

// === EVIDENCE GRAPH ===
// Shows evidence items grouped by sourceAgent with connections to what they discovered
function buildEvidenceGraph(data) {
    const nodesMap = new Map();
    const links = [];

    // Create agent nodes
    const agents = new Set();
    data.evidence?.forEach(e => agents.add(e.sourceAgent));

    agents.forEach(agent => {
        nodesMap.set(`agent_${agent}`, {
            id: `agent_${agent}`,
            label: agent,
            type: 'agent',
            eqbsl: { b: 0.8, d: 0.05, u: 0.15, a: 0.5 }
        });
    });

    // Create evidence nodes and link to agents
    data.evidence?.slice(0, 300).forEach((e, i) => {
        const label = e.content?.path || e.content?.tool || e.content?.type || `ev_${i}`;
        nodesMap.set(e.id, {
            id: e.id,
            label: label.substring(0, 30),
            type: 'evidence',
            agent: e.sourceAgent,
            fullContent: e.content,
            eqbsl: e.eqbsl || { b: 0.5, d: 0.1, u: 0.4, a: 0.5 }
        });

        // Link evidence to its agent
        links.push({
            source: `agent_${e.sourceAgent}`,
            target: e.id,
            type: 'produced',
            eqbsl: { b: 0.9, d: 0.02, u: 0.08, a: 0.5 }
        });
    });

    // Connect evidence that share content similarities
    const evidenceByType = new Map();
    data.evidence?.slice(0, 300).forEach(e => {
        const type = e.content?.type || e.content?.tool || 'other';
        if (!evidenceByType.has(type)) evidenceByType.set(type, []);
        evidenceByType.get(type).push(e.id);
    });

    // Link evidence of same type (sampled)
    evidenceByType.forEach((ids, type) => {
        if (ids.length > 1 && ids.length < 20) {
            for (let i = 0; i < Math.min(ids.length - 1, 5); i++) {
                links.push({
                    source: ids[i],
                    target: ids[i + 1],
                    type: 'related',
                    eqbsl: { b: 0.4, d: 0.2, u: 0.4, a: 0.5 }
                });
            }
        }
    });

    // Calculate EQBSL
    links.forEach(link => {
        const eqbsl = link.eqbsl || { b: 0.5, d: 0.2, u: 0.3, a: 0.5 };
        link.expectation = eqbsl.b + (eqbsl.a * eqbsl.u);
        link.controversy = eqbsl.b * eqbsl.d;
        link.uncertainty = eqbsl.u;
    });

    return { nodes: Array.from(nodesMap.values()), links };
}

// === PROVENANCE GRAPH ===
// Shows source → event_type → target relationships
function buildProvenanceGraph(data) {
    const nodesMap = new Map();
    const links = [];

    // Infer event types from evidence content
    const eventTypes = new Map();

    data.evidence?.slice(0, 400).forEach(e => {
        const eventType = e.content?.type || e.content?.tool || 'observation';

        // Create event type node if new
        if (!eventTypes.has(eventType)) {
            eventTypes.set(eventType, {
                id: `type_${eventType}`,
                label: eventType.toUpperCase(),
                type: 'eventType',
                count: 0,
                eqbsl: { b: 0.7, d: 0.1, u: 0.2, a: 0.5 }
            });
        }
        eventTypes.get(eventType).count++;

        // Create target node from evidence content
        let targetId = null;
        let targetLabel = null;

        if (e.content?.path) {
            // Extract first path segment as target
            const parts = e.content.path.split('/').filter(p => p);
            if (parts.length > 0) {
                targetId = `target_${parts[0]}`;
                targetLabel = `/${parts[0]}`;
            }
        } else if (e.content?.tool === 'subfinder') {
            targetId = 'target_subdomains';
            targetLabel = 'Subdomains';
        } else if (e.content?.tool === 'nmap') {
            targetId = 'target_ports';
            targetLabel = 'Open Ports';
        } else if (e.content?.tool === 'whatweb') {
            targetId = 'target_tech';
            targetLabel = 'Tech Stack';
        }

        if (targetId && !nodesMap.has(targetId)) {
            nodesMap.set(targetId, {
                id: targetId,
                label: targetLabel,
                type: 'target',
                eqbsl: { b: 0.6, d: 0.15, u: 0.25, a: 0.5 }
            });
        }

        // Link event type to target
        if (targetId) {
            const linkKey = `type_${eventType}->${targetId}`;
            if (!links.find(l => `${l.source}->${l.target}` === linkKey)) {
                links.push({
                    source: `type_${eventType}`,
                    target: targetId,
                    type: 'observes',
                    eqbsl: { b: 0.65, d: 0.1, u: 0.25, a: 0.5 }
                });
            }
        }
    });

    // Add event type nodes
    eventTypes.forEach(node => nodesMap.set(node.id, node));

    // Create source (agent) nodes and link to event types
    const agents = new Set();
    data.evidence?.forEach(e => agents.add(e.sourceAgent));

    agents.forEach(agent => {
        nodesMap.set(`source_${agent}`, {
            id: `source_${agent}`,
            label: agent,
            type: 'source',
            eqbsl: { b: 0.85, d: 0.03, u: 0.12, a: 0.5 }
        });
    });

    // Link sources to event types they produce (only if both nodes exist)
    data.evidence?.forEach(e => {
        const eventType = e.content?.type || e.content?.tool || 'observation';
        const sourceId = `source_${e.sourceAgent}`;
        const targetId = `type_${eventType}`;

        // Only add link if both nodes exist
        if (nodesMap.has(sourceId) && nodesMap.has(targetId)) {
            const linkKey = `${sourceId}->${targetId}`;
            if (!links.find(l => `${l.source}->${l.target}` === linkKey)) {
                links.push({
                    source: sourceId,
                    target: targetId,
                    type: 'emits',
                    eqbsl: { b: 0.8, d: 0.05, u: 0.15, a: 0.5 }
                });
            }
        }
    });

    // Calculate EQBSL
    links.forEach(link => {
        const eqbsl = link.eqbsl || { b: 0.5, d: 0.2, u: 0.3, a: 0.5 };
        link.expectation = eqbsl.b + (eqbsl.a * eqbsl.u);
        link.controversy = eqbsl.b * eqbsl.d;
        link.uncertainty = eqbsl.u;
    });

    return { nodes: Array.from(nodesMap.values()), links };
}

function generateGraphHtml(nodes, links, data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shannon World Model - EQBSL Knowledge Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; overflow: hidden; }
        #header { position: fixed; top: 0; left: 0; right: 0; padding: 16px 24px; background: rgba(0,0,0,0.3); backdrop-filter: blur(10px); z-index: 100; display: flex; justify-content: space-between; align-items: center; }
        #header h1 { font-size: 1.5rem; }
        #stats { display: flex; gap: 24px; }
        .stat { padding: 8px 16px; background: rgba(255,255,255,0.1); border-radius: 8px; }
        .stat-value { font-size: 1.25rem; font-weight: bold; color: #4ecdc4; }
        #graph { width: 100vw; height: 100vh; }
        #tooltip { position: absolute; background: rgba(0,0,0,0.95); padding: 12px 16px; border-radius: 8px; font-size: 0.875rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; max-width: 350px; border: 1px solid rgba(255,255,255,0.2); }
        .tensor-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin: 4px 0; }
        .tensor-b { background: #4ecdc4; }
        .tensor-d { background: #ff6b6b; }
        .tensor-u { background: #ffd93d; }
        #legend { position: fixed; bottom: 20px; right: 20px; background: rgba(0,0,0,0.5); padding: 16px; border-radius: 8px; }
        .legend-item { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 0.875rem; }
        .legend-dot { width: 12px; height: 12px; border-radius: 50%; }
        .legend-line { width: 24px; height: 3px; border-radius: 2px; }
        #controls { position: fixed; bottom: 20px; left: 20px; display: flex; gap: 8px; flex-wrap: wrap; max-width: 300px; }
        button { padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        button:hover { background: rgba(255,255,255,0.2); }
        button.active { background: rgba(78, 205, 196, 0.3); border-color: #4ecdc4; }
    </style>
</head>
<body>
    <div id="header">
        <h1>🌐 Shannon EQBSL Knowledge Graph</h1>
        <div id="stats">
            <div class="stat"><span class="stat-value">${data.evidence?.length || 0}</span> Evidence</div>
            <div class="stat"><span class="stat-value">${data.claims?.length || 0}</span> Claims</div>
            <div class="stat"><span class="stat-value">${data.relations?.length || 0}</span> Relations</div>
        </div>
    </div>
    <svg id="graph"></svg>
    <div id="tooltip"></div>
    <div id="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#4ecdc4"></div> Evidence</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ff6b6b"></div> Claims</div>
        <hr style="margin: 8px 0; border-color: rgba(255,255,255,0.2)"/>
        <div class="legend-item"><div class="legend-line" style="background:#4ecdc4"></div> High Belief (E→1)</div>
        <div class="legend-item"><div class="legend-line" style="background:#ff6b6b"></div> Low Belief (E→0)</div>
        <div class="legend-item"><div class="legend-line" style="background:#ffd93d; opacity:0.5"></div> High Uncertainty</div>
    </div>
    <div id="controls">
        <button onclick="resetZoom()">Reset Zoom</button>
        <button onclick="toggleForce()">Toggle Force</button>
        <button id="edgeModeBtn" onclick="cycleEdgeMode()">Edges: Expectation</button>
    </div>
    <script>
        const nodes = ${JSON.stringify(nodes)};
        const links = ${JSON.stringify(links)};
        const width = window.innerWidth, height = window.innerHeight;
        const svg = d3.select('#graph').attr('width', width).attr('height', height);
        const g = svg.append('g');
        const zoom = d3.zoom().scaleExtent([0.1, 10]).on('zoom', (e) => g.attr('transform', e.transform));
        svg.call(zoom);
        
        // Edge color scale based on expectation (E = b + a*u)
        const edgeColorScale = d3.scaleLinear().domain([0, 0.5, 1]).range(['#ff6b6b', '#ffd93d', '#4ecdc4']);
        
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(80))
            .force('charge', d3.forceManyBody().strength(-120))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(25));
        
        // Create edges with EQBSL-based styling
        const link = g.append('g').selectAll('line').data(links).join('line')
            .attr('stroke', d => edgeColorScale(d.expectation || 0.5))
            .attr('stroke-opacity', d => 0.3 + (1 - (d.uncertainty || 0.5)) * 0.7)  // More opaque = less uncertain
            .attr('stroke-width', d => 1 + (d.expectation || 0.5) * 3);  // Thicker = higher confidence
        
        const node = g.append('g').selectAll('circle').data(nodes).join('circle')
            .attr('r', d => d.type === 'claim' ? 10 : 6)
            .attr('fill', d => d.type === 'claim' ? '#ff6b6b' : '#4ecdc4')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .call(drag(simulation));
        
        const tooltip = d3.select('#tooltip');
        
        // Node tooltip with EQBSL tensor visualization
        node.on('mouseover', (e, d) => {
            const eqbsl = d.eqbsl || {b:0.33,d:0.33,u:0.34,a:0.5};
            const tensorHtml = '<div class="tensor-bar"><div class="tensor-b" style="width:'+(eqbsl.b*100)+'%"></div><div class="tensor-d" style="width:'+(eqbsl.d*100)+'%"></div><div class="tensor-u" style="width:'+(eqbsl.u*100)+'%"></div></div><small style="color:#888">B:'+eqbsl.b.toFixed(2)+' D:'+eqbsl.d.toFixed(2)+' U:'+eqbsl.u.toFixed(2)+' a:'+eqbsl.a.toFixed(2)+'</small>';
            tooltip.style('opacity', 1)
                .html('<strong>'+d.type.toUpperCase()+'</strong><br/><strong>ID:</strong> '+d.id.substring(0,16)+'<br/><strong>Label:</strong> '+d.label+(d.agent ? '<br/><strong>Agent:</strong> '+d.agent : '')+(d.confidence ? '<br/><strong>Confidence:</strong> '+(d.confidence * 100).toFixed(0)+'%' : '')+'<br/><br/><strong>EQBSL Tensor:</strong>'+tensorHtml)
                .style('left', (e.pageX + 10) + 'px')
                .style('top', (e.pageY - 10) + 'px');
        }).on('mouseout', () => tooltip.style('opacity', 0));
        
        // Edge tooltip
        link.on('mouseover', (e, d) => {
            const eqbsl = d.eqbsl || {b:0.5,d:0.2,u:0.3,a:0.5};
            const tensorHtml = '<div class="tensor-bar"><div class="tensor-b" style="width:'+(eqbsl.b*100)+'%"></div><div class="tensor-d" style="width:'+(eqbsl.d*100)+'%"></div><div class="tensor-u" style="width:'+(eqbsl.u*100)+'%"></div></div>';
            tooltip.style('opacity', 1)
                .html('<strong>RELATION: '+d.type+'</strong><br/>E(xpectation): '+(d.expectation*100).toFixed(0)+'%<br/>Uncertainty: '+(d.uncertainty*100).toFixed(0)+'%'+tensorHtml)
                .style('left', (e.pageX + 10) + 'px')
                .style('top', (e.pageY - 10) + 'px');
        }).on('mouseout', () => tooltip.style('opacity', 0));
        
        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('cx', d => d.x).attr('cy', d => d.y);
        });
        
        function drag(simulation) {
            return d3.drag()
                .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
        }
        
        let isRunning = true;
        function toggleForce() { isRunning = !isRunning; if (isRunning) simulation.restart(); else simulation.stop(); }
        function resetZoom() { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); }
        
        // Cycle edge visualization mode
        const edgeModes = ['expectation', 'uncertainty', 'controversy'];
        let edgeModeIdx = 0;
        function cycleEdgeMode() {
            edgeModeIdx = (edgeModeIdx + 1) % edgeModes.length;
            const mode = edgeModes[edgeModeIdx];
            document.getElementById('edgeModeBtn').textContent = 'Edges: ' + mode.charAt(0).toUpperCase() + mode.slice(1);
            
            link.transition().duration(300)
                .attr('stroke', d => {
                    if (mode === 'expectation') return edgeColorScale(d.expectation || 0.5);
                    if (mode === 'uncertainty') return d3.interpolateYlOrRd(d.uncertainty || 0.5);
                    if (mode === 'controversy') return d3.interpolatePurples(0.3 + d.controversy * 3);
                    return '#555';
                })
                .attr('stroke-width', d => {
                    if (mode === 'expectation') return 1 + (d.expectation || 0.5) * 3;
                    if (mode === 'uncertainty') return 1 + (d.uncertainty || 0.5) * 4;
                    if (mode === 'controversy') return 1 + d.controversy * 10;
                    return 2;
                });
        }
    </script>
</body>
</html>`;
}
