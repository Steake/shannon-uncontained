
const { fs, path, glob } = require('zx');

async function backfill() {
    console.log('🔍 Searching for world-model.json...');
    const files = await glob('shannon-results/repos/**/world-model.json');

    if (files.length === 0) {
        console.error('❌ No world models found.');
        return;
    }

    let count = 0;

    for (const file of files) {
        try {
            const content = await fs.readJson(file);
            // FIX: events are nested inside evidence_graph
            const events = content.evidence_graph?.events || content.events || [];

            // Find tech_detection events
            const techEvents = events.filter(e => e.event_type === 'tech_detection');

            if (techEvents.length === 0) continue;

            const target = content.target || 'unknown';

            // Tech Detection Parsing Logic
            const techStack = new Set();

            for (const e of techEvents) {
                let raw = e.payload.technology;
                // Handle stringified JSON (WhatWeb output)
                if (typeof raw === 'string' && raw.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(raw);
                        // WhatWeb JSON structure: "plugins": { "Next.js": {...} }
                        if (parsed.plugins) {
                            Object.keys(parsed.plugins).forEach(k => techStack.add(k));
                        }
                    } catch (err) { }
                } else if (typeof raw === 'string') {
                    // Simple string
                    const clean = raw.replace(/['"]+/g, '');
                    if (clean.length > 2) techStack.add(clean);
                }
            }

            // Exclude noise
            const noise = new Set(['US', 'IP', 'Cookies', 'HTTPServer', 'Http-Only', 'X-Frame-Options', 'Strict-Transport-Security', 'Email', 'HTML5', 'UncommonHeaders']);
            const cleanStack = [...techStack].filter(t => !noise.has(t));

            if (cleanStack.length === 0) {
                continue;
            }

            console.log(`Found technologies for ${target}:`, cleanStack);

            // Determine the "Framework" label (Target Variable)
            const framework = cleanStack.find(t => ['Next.js', 'WordPress', 'Express', 'Django', 'React', 'Vue', 'Cloudflare', 'ASP.NET'].includes(t)) || 'Generic';

            // Create ArchNet training entry
            const datum = {
                type: 'arch_net',
                timestamp: Date.now(),
                features: {
                    url: target,
                    headers: {
                        'x-powered-by': framework // Simulated feature
                    },
                    html_tags: [],
                    cookies: [],
                    heuristic_framework: framework
                }
            };

            // Append to training data
            const mlDir = path.join(path.dirname(file), 'ml-training');
            await fs.ensureDir(mlDir);
            const trainingFile = path.join(mlDir, `training-data-backfill-${Date.now()}.jsonl`);

            await fs.appendFile(trainingFile, JSON.stringify(datum) + '\n');
            console.log(`✅ Backfilled ${target} with framework: ${framework}`);
            count++;

        } catch (e) {
            console.error(`Error processing ${file}:`, e.message);
        }
    }

    console.log(`🎉 Backfilled ${count} samples.`);
}

backfill().catch(console.error);
