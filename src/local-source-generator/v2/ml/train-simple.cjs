
const { fs, path, glob } = require('zx');

// Tokenizer: Split URL into n-grams or tokens
function tokenize(text) {
    if (!text) return [];
    // Split by non-alphanumeric chars, but keep some important ones or just use char n-grams
    // For URLs, "api", "v1", "users", "_next", "static" are key tokens.
    // Let's use simple non-alphanumeric splitting.
    return text.toLowerCase().split(/[^a-z0-9]/).filter(t => t.length > 2);
}

class NaiveBayes {
    constructor() {
        this.vocab = {}; // token -> { noise: count, signal: count }
        this.classes = { noise: 0, signal: 0 };
        this.totalDocs = 0;
    }

    train(text, label) { // label: 'noise' or 'signal'
        const tokens = tokenize(text);
        this.classes[label]++;
        this.totalDocs++;

        for (const token of tokens) {
            if (!this.vocab[token]) {
                this.vocab[token] = { noise: 0, signal: 0 };
            }
            this.vocab[token][label]++;
        }
    }

    predict(text) {
        const tokens = tokenize(text);
        let scoreNoise = Math.log(this.classes.noise / this.totalDocs);
        let scoreSignal = Math.log(this.classes.signal / this.totalDocs);

        for (const token of tokens) {
            if (this.vocab[token]) {
                // Laplacian smoothing (+1)
                const probNoise = (this.vocab[token].noise + 1) / (this.classes.noise + 2);
                const probSignal = (this.vocab[token].signal + 1) / (this.classes.signal + 2);

                scoreNoise += Math.log(probNoise);
                scoreSignal += Math.log(probSignal);
            }
        }

        return scoreSignal > scoreNoise ? 'signal' : 'noise';
    }

    serialize() {
        return JSON.stringify({
            vocab: this.vocab,
            classes: this.classes,
            totalDocs: this.totalDocs
        });
    }
}

async function run() {
    console.log('🔍 Loading training data...');
    const files = await glob('shannon-results/repos/**/ml-training/training-data-*.jsonl');

    if (files.length === 0) {
        console.error('❌ No training data found');
        return;
    }

    const classifier = new NaiveBayes();
    let count = 0;

    for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'filter_net') {
                    const label = entry.features.heuristic_label; // 'noise' or 'signal'
                    const text = entry.features.path || entry.features.url;
                    classifier.train(text, label);
                    count++;
                }
            } catch (e) { }
        }
    }

    console.log(`🧠 Trained on ${count} samples.`);
    console.log(`   Noise: ${classifier.classes.noise}, Signal: ${classifier.classes.signal}`);

    const modelPath = path.join(process.cwd(), 'models/filternet-bayes.json');
    await fs.ensureDir(path.dirname(modelPath));
    await fs.writeFile(modelPath, classifier.serialize());
    console.log(`💾 Model saved to ${modelPath}`);

    // Verification
    console.log('\n🧪 Validation Checks:');
    const cases = [
        '/api/v1/users',      // Expect: signal
        '/_next/static/css',  // Expect: noise
        '/wp-content/themes', // Expect: noise
        '/auth/login'         // Expect: signal
    ];

    for (const c of cases) {
        console.log(`   "${c}" -> ${classifier.predict(c)}`);
    }
}

run().catch(console.error);
