
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

async function resolveNmap() {
    const candidates = [
        'nmap', // PATH
        '/usr/local/bin/nmap', // Intel Mac / Linux
        '/opt/homebrew/bin/nmap', // Apple Silicon
        '/usr/bin/nmap' // System
    ];

    if (process.platform === 'darwin') {
        candidates.push('/usr/local/Cellar/nmap/7.95_1/bin/nmap');
    }

    console.log('--- RESOLUTION START ---');
    for (const bin of candidates) {
        console.log(`Checking candidate: ${bin}`);
        try {
            if (bin !== 'nmap') {
                await access(bin, constants.X_OK);
                console.log(`  [Access OK]`);
            } else {
                console.log(`  [Skipping Access Check for PATH]`);
            }

            // Verify it supports NSE (critical requirement)
            // 'nmap -V' is too lenient. Use --script-help to test engine initialization.
            console.log(`  [Checking capability] ${bin} --script-help banner`);
            await execFileAsync(bin, ['--script-help', 'banner']);
            console.log(`  [Capability OK]`);
            return bin;
        } catch (e) {
            console.log(`  [FAIL] ${e.message}`);
        }
    }
    return null;
}

async function run() {
    const bin = await resolveNmap();
    console.log(`\nResolved Binary: ${bin}`);

    if (bin) {
        const cmd = bin;
        const args = ['-sV', '-p', '80,443', '--open', 'REDACTED_DOMAIN'];
        console.log(`\nRunning Scan: ${cmd} ${args.join(' ')}`);
        try {
            const { stdout, stderr } = await execFileAsync(cmd, args);
            console.log('--- SCAN SUCCESS ---');
            console.log(stdout);
        } catch (e) {
            console.log('--- SCAN FAILED ---');
            console.error(e);
            console.error('STDERR:', e.stderr);
        }
    } else {
        console.error('Could not resolve nmap binary!');
    }
}

run();
