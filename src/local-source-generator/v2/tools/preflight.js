/**
 * Tool Preflight - Check tool availability at startup
 * 
 * Validates that required external tools are installed and
 * reports missing tools with installation instructions.
 */

import { spawn } from 'node:child_process';

/**
 * Tool registry with installation instructions
 */
const TOOL_REGISTRY = {
    // Core reconnaissance tools
    nmap: {
        check: 'nmap --version',
        required: true,
        category: 'recon',
        install: {
            macos: 'brew install nmap',
            ubuntu: 'sudo apt-get install nmap',
            arch: 'sudo pacman -S nmap'
        }
    },
    subfinder: {
        check: 'subfinder -version',
        required: true,
        category: 'recon',
        install: {
            all: 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest'
        }
    },
    whatweb: {
        check: 'whatweb --version',
        required: true,
        category: 'recon',
        install: {
            macos: 'brew install whatweb',
            ubuntu: 'sudo apt-get install whatweb'
        }
    },
    httpx: {
        check: 'httpx -version',
        required: false,
        category: 'recon',
        install: {
            all: 'go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest'
        }
    },
    katana: {
        check: 'katana -version',
        required: false,
        category: 'recon',
        install: {
            all: 'go install github.com/projectdiscovery/katana/cmd/katana@latest'
        }
    },
    gau: {
        check: 'gau --version',
        required: false,
        category: 'recon',
        install: {
            all: 'go install github.com/lc/gau/v2/cmd/gau@latest'
        }
    },

    // Exploitation tools
    nuclei: {
        check: 'nuclei -version',
        required: false,
        category: 'exploitation',
        install: {
            all: 'go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest'
        }
    },
    sqlmap: {
        check: 'sqlmap --version',
        required: false,
        category: 'exploitation',
        install: {
            macos: 'brew install sqlmap',
            ubuntu: 'sudo apt-get install sqlmap',
            pip: 'pip install sqlmap'
        }
    },
    xsstrike: {
        check: 'xsstrike --help',
        required: false,
        category: 'exploitation',
        install: {
            pip: 'pip install xsstrike'
        }
    },
    commix: {
        check: 'commix --version',
        required: false,
        category: 'exploitation',
        install: {
            pip: 'pip install commix'
        }
    },

    // Content discovery
    feroxbuster: {
        check: 'feroxbuster --version',
        required: false,
        category: 'discovery',
        install: {
            macos: 'brew install feroxbuster',
            cargo: 'cargo install feroxbuster'
        }
    },
    ffuf: {
        check: 'ffuf -V',
        required: false,
        category: 'discovery',
        install: {
            all: 'go install github.com/ffuf/ffuf/v2@latest'
        }
    },

    // Secret scanning
    trufflehog: {
        check: 'trufflehog --version',
        required: false,
        category: 'secrets',
        install: {
            macos: 'brew install trufflesecurity/trufflehog/trufflehog',
            all: 'go install github.com/trufflesecurity/trufflehog/v3@latest'
        }
    },
    gitleaks: {
        check: 'gitleaks version',
        required: false,
        category: 'secrets',
        install: {
            macos: 'brew install gitleaks',
            all: 'go install github.com/gitleaks/gitleaks/v8@latest'
        }
    },

    // Blue team / analysis
    sslyze: {
        check: 'sslyze --version',
        required: false,
        category: 'analysis',
        install: {
            pip: 'pip install sslyze'
        }
    },
    wafw00f: {
        check: 'wafw00f --version',
        required: false,
        category: 'analysis',
        install: {
            pip: 'pip install wafw00f'
        }
    },

    // Metasploit
    msfrpcd: {
        check: 'msfrpcd -h',
        required: false,
        category: 'exploitation',
        install: {
            macos: 'brew install metasploit',
            ubuntu: 'curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall && chmod 755 msfinstall && ./msfinstall'
        }
    },
    msfconsole: {
        check: 'msfconsole -v',
        required: false,
        category: 'exploitation',
        install: {
            macos: 'brew install metasploit',
            ubuntu: 'curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall && chmod 755 msfinstall && ./msfinstall'
        }
    }
};

/**
 * Check if a tool is available
 * @param {string} toolName - Name of the tool
 * @returns {Promise<boolean>} Whether the tool is available
 */
export async function isToolAvailable(toolName) {
    const tool = TOOL_REGISTRY[toolName];
    if (!tool) {
        // Try direct check
        return checkCommand(`which ${toolName}`);
    }
    return checkCommand(tool.check);
}

/**
 * Run a command and check if it succeeds
 */
async function checkCommand(cmd) {
    return new Promise((resolve) => {
        const [command, ...args] = cmd.split(' ');
        const proc = spawn(command, args, {
            shell: true,
            stdio: 'pipe'
        });

        proc.on('close', (code) => {
            resolve(code === 0);
        });

        proc.on('error', () => {
            resolve(false);
        });

        // Timeout after 10s
        setTimeout(() => {
            proc.kill();
            resolve(false);
        }, 10000);
    });
}

/**
 * Run preflight checks for all tools
 * @param {object} options - Options
 * @param {boolean} options.requiredOnly - Only check required tools
 * @param {string[]} options.categories - Categories to check
 * @returns {Promise<PreflightResult>}
 */
export async function runPreflight(options = {}) {
    const { requiredOnly = false, categories = null } = options;

    const results = {
        available: [],
        missing: [],
        byCategory: {},
        hasRequired: true
    };

    const toolsToCheck = Object.entries(TOOL_REGISTRY).filter(([name, config]) => {
        if (requiredOnly && !config.required) return false;
        if (categories && !categories.includes(config.category)) return false;
        return true;
    });

    // Check tools in parallel
    const checks = await Promise.all(
        toolsToCheck.map(async ([name, config]) => {
            const available = await isToolAvailable(name);
            return { name, config, available };
        })
    );

    for (const { name, config, available } of checks) {
        const category = config.category;

        if (!results.byCategory[category]) {
            results.byCategory[category] = { available: [], missing: [] };
        }

        if (available) {
            results.available.push(name);
            results.byCategory[category].available.push(name);
        } else {
            results.missing.push({
                name,
                required: config.required,
                install: config.install
            });
            results.byCategory[category].missing.push(name);

            if (config.required) {
                results.hasRequired = false;
            }
        }
    }

    return results;
}

/**
 * Print preflight results to console
 */
export function printPreflightResults(results, verbose = false) {
    console.log('\n🔧 Tool Preflight Check');
    console.log('═'.repeat(50));

    // Show available tools
    if (verbose && results.available.length > 0) {
        console.log(`\n✅ Available (${results.available.length}):`);
        for (const tool of results.available) {
            console.log(`   • ${tool}`);
        }
    }

    // Show missing tools
    if (results.missing.length > 0) {
        console.log(`\n❌ Missing (${results.missing.length}):`);
        for (const { name, required, install } of results.missing) {
            const tag = required ? ' [REQUIRED]' : '';
            console.log(`   • ${name}${tag}`);

            if (verbose && install) {
                const instructions = Object.entries(install)
                    .map(([platform, cmd]) => `      ${platform}: ${cmd}`)
                    .join('\n');
                console.log(instructions);
            }
        }
    }

    // Show by category
    if (verbose) {
        console.log('\n📊 By Category:');
        for (const [category, tools] of Object.entries(results.byCategory)) {
            const total = tools.available.length + tools.missing.length;
            const available = tools.available.length;
            console.log(`   ${category}: ${available}/${total} available`);
        }
    }

    console.log('═'.repeat(50));

    if (!results.hasRequired) {
        console.log('\n⚠️  Some REQUIRED tools are missing. Install them to proceed.\n');
    } else if (results.missing.length > 0) {
        console.log(`\n💡 ${results.missing.length} optional tools missing. Some features may be unavailable.\n`);
    } else {
        console.log('\n✅ All tools available!\n');
    }
}

/**
 * Check LLM API key availability and print warning if missing
 * @returns {object} LLM status with provider and warning
 */
export function checkLLMConfig() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const llmKey = process.env.LLM_API_KEY;
    const llmProvider = process.env.LLM_PROVIDER;

    const hasKey = !!(anthropicKey || openaiKey || llmKey);

    return {
        hasKey,
        provider: llmProvider || (anthropicKey ? 'anthropic' : (openaiKey ? 'openai' : null)),
        anthropicKey: !!anthropicKey,
        openaiKey: !!openaiKey,
        llmKey: !!llmKey,
    };
}

/**
 * Print LLM configuration warning if no API keys are set
 */
export function printLLMWarning() {
    const llmConfig = checkLLMConfig();

    if (!llmConfig.hasKey) {
        console.log('\n' + '⚠'.repeat(25));
        console.log('⚠️  WARNING: No LLM API key configured!');
        console.log('   AI-powered synthesis will be DISABLED.');
        console.log('   Generated code quality will be significantly degraded.');
        console.log('');
        console.log('   Set one of the following environment variables:');
        console.log('     export ANTHROPIC_API_KEY=sk-...');
        console.log('     export OPENAI_API_KEY=sk-...');
        console.log('     export LLM_API_KEY=...');
        console.log('⚠'.repeat(25) + '\n');
        return false;
    } else {
        const provider = llmConfig.provider || 'auto-detected';
        console.log(`  ✅ LLM configured (${provider})`);
        return true;
    }
}

/**
 * Get installation instructions for missing tools
 */
export function getInstallInstructions(results, platform = 'macos') {
    const instructions = [];

    for (const { name, install } of results.missing) {
        const cmd = install[platform] || install.all || install.pip || Object.values(install)[0];
        if (cmd) {
            instructions.push({ tool: name, command: cmd });
        }
    }

    return instructions;
}

export { TOOL_REGISTRY };
