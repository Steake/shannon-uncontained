
const { fs, glob } = require('zx');

async function debug() {
    const files = await glob('shannon-results/repos/**/world-model.json');
    for (const file of files) {
        console.log(`--- Checking ${file} ---`);
        const content = await fs.readJson(file);
        const techEvents = (content.events || []).filter(e => e.type === 'tech_detection');

        techEvents.forEach((e, i) => {
            console.log(`[Event ${i}] Raw Payload Technology:`);
            console.log(e.payload.technology.substring(0, 200) + '...'); // Print first 200 chars

            try {
                const raw = e.payload.technology;
                if (raw.trim().startsWith('{')) {
                    const parsed = JSON.parse(raw);
                    console.log(`[Event ${i}] Parsed Plugins keys:`, Object.keys(parsed.plugins || {}));
                }
            } catch (err) {
                console.log(`[Event ${i}] Parse Error:`, err.message);
            }
        });
    }
}
debug();
