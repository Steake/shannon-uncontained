
import { Cortex } from './src/local-source-generator/v2/ml/cortex.js';

async function test() {
    console.log('🧠 Initializing Cortex...');
    const cortex = new Cortex();
    await cortex.init();

    const cases = [
        { url: 'https://example.com/api/v1/users', path: '/api/v1/users', expected: 'signal' },
        { url: 'https://example.com/_next/static/chunks/main.js', path: '/_next/static/chunks/main.js', expected: 'noise' },
        { url: 'https://example.com/auth/login', path: '/auth/login', expected: 'signal' }
    ];

    console.log('\n🧪 Running Predictions:');
    let pass = 0;

    for (const c of cases) {
        const result = cortex.predictFilter(c.url, c.path);
        const match = result.label === c.expected;
        const icon = match ? '✅' : '❌';
        console.log(`${icon} ${c.path} -> ${result.label} (Score: ${result.score.toFixed(2)}, Model: ${result.model})`);

        if (result.model !== 'filternet_bayes_v1') {
            console.error('   🚨 ERROR: Model is not Bayes! Got:', result.model);
        }

        if (match) pass++;
    }

    if (pass === cases.length) {
        console.log('\n✨ ALL TESTS PASSED. Cortex is using ML.');
    } else {
        console.error('\n💥 SOME TESTS FAILED.');
        process.exit(1);
    }
}

test().catch(console.error);
