/**
 * Misconfiguration Detector ("They Did It Wrong")
 * 
 * Detects common developer mistakes: debug flags, hidden admin features,
 * hardcoded secrets, CORS misconfigs, leaked dependencies.
 */

import { withTimeout } from '../utils/resilience.js';

/**
 * God mode / debug flag patterns
 */
const GOD_MODE_PARAMS = [
    // Debug flags
    'debug', 'debug_mode', 'debugMode', 'Debug',
    'test', 'testing', 'testMode', 'test_mode',
    'dev', 'development', 'devMode', 'dev_mode',
    'verbose', 'trace', 'log_level',

    // Admin bypass
    'admin', 'isAdmin', 'is_admin', 'admin_mode',
    'superuser', 'root', 'god', 'godmode',
    'bypass', 'skip_auth', 'skip_validation',
    'override', 'force', 'sudo',

    // Feature flags
    'feature_flag', 'ff', 'beta', 'preview',
    'internal', 'employee', 'staff'
];

/**
 * Hardcoded secret patterns
 */
const SECRET_PATTERNS = {
    awsKey: /AKIA[0-9A-Z]{16}/g,
    awsSecret: /[A-Za-z0-9/+=]{40}/g,
    githubToken: /ghp_[A-Za-z0-9]{36}/g,
    genericApiKey: /['"`]api[_-]?key['"`]\s*[:=]\s*['"`]([^'"`]{20,})['"`]/gi,
    password: /['"`]password['"`]\s*[:=]\s*['"`]([^'"`]+)['"`]/gi,
    jwtSecret: /['"`]jwt[_-]?secret['"`]\s*[:=]\s*['"`]([^'"`]+)['"`]/gi,
    privateKey: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    connectionString: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/gi,
    slackWebhook: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g
};

/**
 * Build path patterns (developer environment leaks)
 */
const BUILD_PATH_PATTERNS = [
    /\/Users\/[\w]+\/[\w/]+/g,           // macOS paths
    /\/home\/[\w]+\/[\w/]+/g,            // Linux paths
    /[CD]:\\Users\\[\w]+\\[\w\\]+/gi,    // Windows paths
    /\/var\/www\/[\w/]+/g,               // Web server paths
    /\/opt\/[\w/]+\/node_modules/g       // Node.js paths
];

/**
 * TODO/FIXME patterns with security implications
 */
const TODO_PATTERNS = [
    /\/\/\s*TODO:\s*(.*(auth|security|password|token|key|secret|hack|vuln|fix|broken).{0,100})/gi,
    /\/\/\s*FIXME:\s*(.*(auth|security|password|token|key|secret|hack|vuln|fix|broken).{0,100})/gi,
    /\/\/\s*XXX:\s*(.{0,150})/gi,
    /\/\/\s*HACK:\s*(.{0,150})/gi,
    /\/\/\s*BUG:\s*(.{0,150})/gi,
    /\/\*\s*SECURITY:\s*([^*]+)\*\//gi
];

/**
 * Detect god mode / debug flag parameters
 * 
 * @param {Array} endpoints - Discovered endpoints
 * @returns {Array} - Endpoints with potential god mode params
 */
export function detectGodModeParams(endpoints) {
    const findings = [];

    for (const endpoint of endpoints) {
        for (const param of endpoint.params || []) {
            const paramLower = param.name.toLowerCase();

            for (const godParam of GOD_MODE_PARAMS) {
                if (paramLower === godParam.toLowerCase() ||
                    paramLower.includes(godParam.toLowerCase())) {
                    findings.push({
                        endpoint: endpoint.path,
                        param: param.name,
                        matchedPattern: godParam,
                        risk: 'high',
                        testPayloads: ['true', '1', 'yes', 'on', 'enable'],
                        description: `Parameter '${param.name}' may enable debug/admin features`
                    });
                    break;
                }
            }
        }
    }

    return findings;
}

/**
 * Scan for hardcoded secrets in content
 * 
 * @param {string} content - JavaScript/config content
 * @returns {Array} - Potential secrets found
 */
export function scanForSecrets(content) {
    const secrets = [];

    if (!content || typeof content !== 'string') return secrets;

    for (const [type, pattern] of Object.entries(SECRET_PATTERNS)) {
        const matches = content.match(pattern);

        if (matches) {
            for (const match of matches) {
                secrets.push({
                    type,
                    value: maskSecret(match),
                    risk: 'critical',
                    fullMatch: match.length > 50 ? match.substring(0, 50) + '...' : match
                });
            }
        }
    }

    return secrets;
}

/**
 * Detect build path leakage
 * 
 * @param {string} content - JavaScript content
 * @returns {Array} - Leaked build paths
 */
export function detectBuildPaths(content) {
    const paths = [];

    if (!content || typeof content !== 'string') return paths;

    for (const pattern of BUILD_PATH_PATTERNS) {
        const matches = content.match(pattern);

        if (matches) {
            for (const match of matches) {
                paths.push({
                    path: match,
                    platform: match.includes('Users') ?
                        (match.includes(':') ? 'windows' : 'macos') : 'linux',
                    risk: 'low',
                    implication: 'Developer environment information disclosure'
                });
            }
        }
    }

    return [...new Map(paths.map(p => [p.path, p])).values()];
}

/**
 * Extract security-relevant TODOs and comments
 * 
 * @param {string} content - Source content
 * @returns {Array} - Security-relevant TODOs
 */
export function extractSecurityTodos(content) {
    const todos = [];

    if (!content || typeof content !== 'string') return todos;

    for (const pattern of TODO_PATTERNS) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
            todos.push({
                type: pattern.source.includes('HACK') ? 'HACK' :
                    pattern.source.includes('FIXME') ? 'FIXME' :
                        pattern.source.includes('SECURITY') ? 'SECURITY' : 'TODO',
                content: match[1]?.trim() || match[0].trim(),
                risk: match[0].toLowerCase().includes('security') ? 'high' : 'medium'
            });
        }
    }

    return todos;
}

/**
 * Check for CORS misconfiguration
 * 
 * @param {string} baseUrl - Target URL
 * @returns {Promise<Object>} - CORS check results
 */
export async function checkCORSMisconfig(baseUrl) {
    const results = {
        vulnerable: false,
        findings: []
    };

    const testOrigins = [
        'https://evil.com',
        'https://attacker.com',
        'null',
        baseUrl.replace('https://', 'http://'),
        baseUrl + '.evil.com'
    ];

    for (const origin of testOrigins) {
        try {
            const response = await withTimeout(
                () => fetch(baseUrl, {
                    method: 'OPTIONS',
                    headers: { 'Origin': origin }
                }),
                5000,
                `CORS check: ${origin}`
            );

            const allowOrigin = response.headers.get('access-control-allow-origin');
            const allowCredentials = response.headers.get('access-control-allow-credentials');

            if (allowOrigin === '*') {
                results.vulnerable = true;
                results.findings.push({
                    issue: 'Wildcard CORS',
                    origin,
                    response: 'Access-Control-Allow-Origin: *',
                    risk: allowCredentials === 'true' ? 'critical' : 'high'
                });
            } else if (allowOrigin === origin && origin !== baseUrl) {
                results.vulnerable = true;
                results.findings.push({
                    issue: 'Reflected Origin',
                    origin,
                    response: `Access-Control-Allow-Origin: ${allowOrigin}`,
                    risk: allowCredentials === 'true' ? 'critical' : 'medium'
                });
            }
        } catch {
            // Request failed
        }
    }

    return results;
}

/**
 * Comprehensive misconfiguration scan
 * 
 * @param {string} baseUrl - Target URL
 * @param {Object} reconData - Reconnaissance data
 * @returns {Promise<Object>} - All misconfiguration findings
 */
export async function scanMisconfigurations(baseUrl, reconData) {
    const findings = {
        godModeParams: [],
        secrets: [],
        buildPaths: [],
        securityTodos: [],
        corsMisconfig: null,
        riskScore: 0
    };

    // God mode params
    findings.godModeParams = detectGodModeParams(reconData.endpoints || []);

    // Analyze JS files for secrets, paths, TODOs
    for (const jsFile of reconData.jsFiles || []) {
        if (jsFile.content) {
            findings.secrets.push(...scanForSecrets(jsFile.content).map(s => ({ ...s, file: jsFile.url })));
            findings.buildPaths.push(...detectBuildPaths(jsFile.content).map(p => ({ ...p, file: jsFile.url })));
            findings.securityTodos.push(...extractSecurityTodos(jsFile.content).map(t => ({ ...t, file: jsFile.url })));
        }
    }

    // CORS check
    findings.corsMisconfig = await checkCORSMisconfig(baseUrl);

    // Calculate risk score
    findings.riskScore = calculateMisconfigRisk(findings);

    return findings;
}

// Helper functions

function maskSecret(secret) {
    if (secret.length <= 8) return '****';
    return secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);
}

function calculateMisconfigRisk(findings) {
    let score = 0;

    score += findings.secrets.filter(s => s.risk === 'critical').length * 25;
    score += findings.godModeParams.length * 15;
    if (findings.corsMisconfig?.vulnerable) score += 20;
    score += findings.securityTodos.filter(t => t.risk === 'high').length * 5;

    return Math.min(score, 100);
}

export { GOD_MODE_PARAMS, SECRET_PATTERNS, TODO_PATTERNS };
