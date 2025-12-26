
const { fs, path, glob } = require('zx');

class ArchNetBayes {
    constructor() {
        // Feature counts: feature_name -> { classA: count, classB: count }
        this.featureCounts = {};
        this.classCounts = {};
        this.totalDocs = 0;
    }

    train(features, label) {
        if (!label) return;

        if (!this.classCounts[label]) this.classCounts[label] = 0;
        this.classCounts[label]++;
        this.totalDocs++;

        // Flatten features into a single list of tokens
        // e.g. "header:server=nginx", "cookie:sessionid"
        const tokens = this.extractTokens(features);

        for (const token of tokens) {
            if (!this.featureCounts[token]) {
                this.featureCounts[token] = {};
            }
            if (!this.featureCounts[token][label]) {
                this.featureCounts[token][label] = 0;
            }
            this.featureCounts[token][label]++;
        }
    }

    extractTokens(features) {
        const tokens = [];

        // Headers (existence or specific values)
        if (features.headers) {
            for (const [k, v] of Object.entries(features.headers)) {
                tokens.push(`header:${k.toLowerCase()}`);
                if (['server', 'x-powered-by', 'via'].includes(k.toLowerCase())) {
                    tokens.push(`header:${k.toLowerCase()}=${v.toLowerCase()}`);
                }
            }
        }

        // Cookies
        if (features.cookies) {
            for (const c of features.cookies) {
                tokens.push(`cookie:${c.name.toLowerCase()}`);
            }
        }

        // HTML Tags (e.g. specific IDs or meta generators)
        if (features.html_tags) {
            for (const tag of features.html_tags) {
                tokens.push(`tag:${tag.toLowerCase()}`);
            }
        }

        return tokens;
    }

    predict(features) {
        const tokens = this.extractTokens(features);
        let bestClass = null;
        let maxScore = -Infinity;

        const classes = Object.keys(this.classCounts);

        for (const cls of classes) {
            let score = Math.log(this.classCounts[cls] / this.totalDocs);

            for (const token of tokens) {
                if (this.featureCounts[token]) {
                    // Laplacian smoothing
                    const count = this.featureCounts[token][cls] || 0;
                    const totalClassDocs = this.classCounts[cls];
                    const prob = (count + 1) / (totalClassDocs + 2); // Simplified smoothing
                    score += Math.log(prob);
                }
            }

            if (score > maxScore) {
                maxScore = score;
                bestClass = cls;
            }
        }

        return {
            label: bestClass,
            score: Math.min(Math.exp(maxScore), 0.99), // Pseudo-probability
            model: 'archnet_bayes_v1'
        };
    }

    serialize() {
        return JSON.stringify({
            featureCounts: this.featureCounts,
            classCounts: this.classCounts,
            totalDocs: this.totalDocs
        });
    }
}

async function run() {
    console.log('🔍 Loading ArchNet training data...');
    // Look for both generated and backfilled data
    const files = await glob('shannon-results/repos/**/ml-training/training-data-*.jsonl');

    if (files.length === 0) {
        console.error('❌ No training data found');
        return;
    }

    const classifier = new ArchNetBayes();
    let count = 0;

    for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'arch_net') {
                    const label = entry.features.heuristic_framework;
                    if (label && label !== 'unknown') {
                        classifier.train(entry.features, label);
                        count++;
                    }
                }
            } catch (e) { }
        }
    }

    console.log(`🧠 Trained on ${count} samples.`);
    console.log('Class distribution:', classifier.classCounts);

    const modelPath = path.join(process.cwd(), 'models/archnet-bayes.json');
    await fs.ensureDir(path.dirname(modelPath));
    await fs.writeFile(modelPath, classifier.serialize());
    console.log(`💾 Model saved to ${modelPath}`);

    // Verification
    console.log('\n🧪 Validation Checks:');
    const mockInputs = [
        { headers: { 'x-powered-by': 'Express' } },
        { cookies: [{ name: 'wp-settings-1' }] },
        { headers: { 'x-vercel-id': 'cle123' } }
    ];

    for (const input of mockInputs) {
        console.log(`   ${JSON.stringify(input)} -> ${JSON.stringify(classifier.predict(input))}`);
    }
}

run().catch(console.error);
