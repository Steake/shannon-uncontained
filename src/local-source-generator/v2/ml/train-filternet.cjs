
const tf = require('@tensorflow/tfjs-node');
const { fs, path, glob } = require('zx');

// Configuration
const MODEL_DIR = path.join(process.cwd(), 'models');
const EPOCHS = 5;
const BATCH_SIZE = 32;

// Vocabulary builder
const CHAR_SET = 'abcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&\'()*+,;=%';
const CHAR_MAP = {};
CHAR_SET.split('').forEach((c, i) => CHAR_MAP[c] = i + 1); // 0 is padding
const SEQ_LEN = 100;

function encodeUrl(url) {
    const lower = url.toLowerCase();
    const vec = new Array(SEQ_LEN).fill(0);
    for (let i = 0; i < Math.min(lower.length, SEQ_LEN); i++) {
        vec[i] = CHAR_MAP[lower[i]] || 0;
    }
    return vec;
}

async function loadData() {
    console.log('🔍 Searching for training data...');
    // Find all training-data-*.jsonl files recursively
    // Logic: Look inside 'shannon-results/repos/*/ml-training/'
    const files = await glob('shannon-results/repos/**/ml-training/training-data-*.jsonl');

    if (files.length === 0) {
        console.error('❌ No training data found! Run the pipeline first.');
        process.exit(1);
    }

    console.log(`📂 Found ${files.length} data files.`);

    const inputs = [];
    const labels = []; // 0 = Noise, 1 = Signal (API/Interesting)

    for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'filter_net') {
                    // We use "heuristic_label" as the ground truth for this initial bootstrap
                    // noise -> 0, signal -> 1
                    const isSignal = entry.features.heuristic_label === 'signal' ? 1 : 0;

                    // Use path as primary feature, maybe full URL later
                    const text = entry.features.path || entry.features.url;
                    inputs.push(encodeUrl(text));
                    labels.push(isSignal);
                }
            } catch (e) {
                // Ignore corrupt lines
            }
        }
    }

    console.log(`📊 Loaded ${inputs.length} samples.`);
    return {
        xs: tf.tensor2d(inputs, [inputs.length, SEQ_LEN]),
        ys: tf.tensor2d(labels, [labels.length, 1])
    };
}

async function createModel() {
    const model = tf.sequential();

    // Character Embedding
    model.add(tf.layers.embedding({
        inputDim: CHAR_SET.length + 2,
        outputDim: 16,
        inputLength: SEQ_LEN
    }));

    // Simple LSTM for sequence pattern recognition
    model.add(tf.layers.lstm({ units: 32, returnSequences: false }));

    // Classifier
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // 0-1 probability

    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    return model;
}

async function train() {
    await fs.ensureDir(MODEL_DIR);

    const { xs, ys } = await loadData();

    const model = await createModel();
    console.log('🚀 Starting training...');

    await model.fit(xs, ys, {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}, val_acc=${logs.val_acc.toFixed(4)}`);
            }
        }
    });

    console.log('💾 Saving model to models/filternet...');
    await model.save(`file://${MODEL_DIR}/filternet`);
}

train().catch(console.error);
