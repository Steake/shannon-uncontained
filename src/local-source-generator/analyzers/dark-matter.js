/**
 * Dark Matter Analyzer
 * 
 * Discovers hidden endpoints, obfuscated code patterns, WebSockets,
 * and performs intelligent directory scanning.
 */

import { withTimeout } from '../utils/resilience.js';

/**
 * Common hidden/admin directories to scan
 */
const HIDDEN_DIRECTORIES = [
    '/admin', '/administrator', '/admin-panel', '/admincp',
    '/wp-admin', '/wp-login.php', '/phpmyadmin', '/pma',
    '/cpanel', '/webmail', '/cgi-bin', '/bin',
    '/backup', '/backups', '/bak', '/old', '/archive',
    '/temp', '/tmp', '/cache', '/logs', '/log',
    '/private', '/secret', '/hidden', '/internal',
    '/api/internal', '/api/private', '/api/admin',
    '/debug', '/test', '/testing', '/dev',
    '/console', '/dashboard', '/portal', '/panel',
    '/manage', '/management', '/manager',
    '/upload', '/uploads', '/files', '/documents',
    '/config', '/configuration', '/settings',
    '/status', '/health', '/metrics', '/monitor',
    '/.well-known', '/.git', '/.svn', '/.env'
];

/**
 * Patterns indicating hidden endpoints in comments
 */
const COMMENT_PATTERNS = [
    // JavaScript/TypeScript comments
    /\/\/\s*TODO:\s*(https?:\/\/[^\s]+|\/[^\s]+)/gi,
    /\/\/\s*FIXME:\s*(https?:\/\/[^\s]+|\/[^\s]+)/gi,
    /\/\/\s*api:\s*(\/[^\s]+)/gi,
    /\/\/\s*endpoint:\s*(\/[^\s]+)/gi,
    /\/\*\s*@route\s+(\/[^\s*]+)/gi,

    // HTML comments
    /<!--\s*(https?:\/\/[^\s]+|\/api[^\s-]+)/gi,
    /<!--\s*TODO:\s*([^-]+)/gi,

    // URL patterns in strings
    /['"`](\/api\/v\d+\/[^'"`]+)['"`]/gi,
    /['"`](\/internal\/[^'"`]+)['"`]/gi,
    /['"`](\/admin\/[^'"`]+)['"`]/gi,
    /['"`](\/debug\/[^'"`]+)['"`]/gi
];

/**
 * Obfuscation indicators
 */
const OBFUSCATION_PATTERNS = {
    packedJS: /eval\(function\(p,a,c,k,e,[rd]\)/,
    base64Heavy: /[A-Za-z0-9+/=]{100,}/g,
    hexStrings: /\\x[0-9a-fA-F]{2}/g,
    unicodeEscape: /\\u[0-9a-fA-F]{4}/g,
    jsFuck: /\[\]\[\[.+\]\]/,
    aaEncode: /ﾟωﾟ|ﾟДﾟ|ﾟΘﾟ/,
    obfuscatorIO: /_0x[a-f0-9]{4,}/gi
};

/**
 * Extract hidden endpoints from HTML/JS comments
 * 
 * @param {string} content - Content to analyze
 * @returns {Array} - Discovered hidden endpoints
 */
export function extractHiddenEndpoints(content) {
    const endpoints = [];

    if (!content || typeof content !== 'string') return endpoints;

    for (const pattern of COMMENT_PATTERNS) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
            const endpoint = match[1] || match[0];
            if (endpoint && endpoint.startsWith('/')) {
                endpoints.push({
                    path: endpoint.trim(),
                    source: 'comment',
                    pattern: pattern.source.substring(0, 30),
                    context: match[0].substring(0, 100)
                });
            }
        }
    }

    return [...new Map(endpoints.map(e => [e.path, e])).values()];
}

/**
 * Detect obfuscated code patterns
 * 
 * @param {string} content - JavaScript content
 * @returns {Object} - Obfuscation detection results
 */
export function detectObfuscation(content) {
    const results = {
        isObfuscated: false,
        patterns: [],
        confidence: 0,
        recommendations: []
    };

    if (!content || typeof content !== 'string') return results;

    for (const [name, pattern] of Object.entries(OBFUSCATION_PATTERNS)) {
        const matches = content.match(pattern);

        if (matches && matches.length > 0) {
            results.patterns.push({
                type: name,
                count: matches.length,
                sample: matches[0].substring(0, 50)
            });
        }
    }

    // Calculate confidence
    if (results.patterns.length > 0) {
        results.isObfuscated = true;
        results.confidence = Math.min(0.3 + (results.patterns.length * 0.2), 0.95);

        results.recommendations.push('Code may be hiding sensitive logic');
        results.recommendations.push('Consider dynamic analysis with debugger');
        results.recommendations.push('Check for unpacked/decoded versions');
    }

    return results;
}

/**
 * Identify WebSocket endpoints
 * 
 * @param {string} content - JavaScript content
 * @returns {Array} - WebSocket endpoints
 */
export function identifyWebSockets(content) {
    const websockets = [];

    if (!content || typeof content !== 'string') return websockets;

    // WebSocket constructor patterns
    const wsPatterns = [
        /new\s+WebSocket\s*\(\s*['"`]([^'"`]+)['"`]/gi,
        /new\s+WebSocket\s*\(\s*`([^`]+)`/gi,
        /wss?:\/\/[^\s'"`<>]+/gi,
        /\.connect\s*\(\s*['"`](wss?:\/\/[^'"`]+)['"`]/gi
    ];

    for (const pattern of wsPatterns) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
            const url = match[1] || match[0];
            if (url.includes('ws://') || url.includes('wss://')) {
                websockets.push({
                    url: url.trim(),
                    protocol: url.includes('wss://') ? 'wss' : 'ws',
                    source: 'js_analysis'
                });
            }
        }
    }

    return [...new Map(websockets.map(w => [w.url, w])).values()];
}

/**
 * Scan for hidden directories
 * 
 * @param {string} baseUrl - Target URL
 * @param {Object} options - Scan options
 * @returns {Promise<Array>} - Discovered directories
 */
export async function scanHiddenDirectories(baseUrl, options = {}) {
    const {
        timeout = 3000,
        directories = HIDDEN_DIRECTORIES
    } = options;

    const discovered = [];

    for (const dir of directories) {
        try {
            const url = new URL(dir, baseUrl).toString();

            const response = await withTimeout(
                () => fetch(url, {
                    method: 'HEAD',
                    redirect: 'manual'
                }),
                timeout,
                `Directory scan: ${dir}`
            );

            // Interesting status codes
            if (response.status === 200 ||
                response.status === 301 ||
                response.status === 302 ||
                response.status === 401 ||
                response.status === 403) {

                discovered.push({
                    path: dir,
                    url,
                    status: response.status,
                    accessible: response.status === 200,
                    authRequired: response.status === 401,
                    forbidden: response.status === 403,
                    redirect: response.status === 301 || response.status === 302
                        ? response.headers.get('location')
                        : null
                });
            }
        } catch {
            // Not accessible
        }
    }

    return discovered;
}

/**
 * Comprehensive dark matter analysis
 * 
 * @param {string} baseUrl - Target URL
 * @param {Object} reconData - Reconnaissance data
 * @returns {Promise<Object>} - Dark matter findings
 */
export async function analyzeDarkMatter(baseUrl, reconData) {
    const findings = {
        hiddenEndpoints: [],
        obfuscatedFiles: [],
        websockets: [],
        hiddenDirectories: [],
        summary: {
            totalHidden: 0,
            hasObfuscation: false,
            hasWebSockets: false
        }
    };

    // Analyze JS files
    for (const jsFile of reconData.jsFiles || []) {
        if (jsFile.content) {
            // Hidden endpoints from comments
            const hidden = extractHiddenEndpoints(jsFile.content);
            findings.hiddenEndpoints.push(...hidden.map(h => ({ ...h, file: jsFile.url })));

            // Obfuscation detection
            const obfuscation = detectObfuscation(jsFile.content);
            if (obfuscation.isObfuscated) {
                findings.obfuscatedFiles.push({
                    file: jsFile.url,
                    ...obfuscation
                });
            }

            // WebSocket endpoints
            const ws = identifyWebSockets(jsFile.content);
            findings.websockets.push(...ws);
        }
    }

    // Scan hidden directories
    findings.hiddenDirectories = await scanHiddenDirectories(baseUrl);

    // Update summary
    findings.summary.totalHidden = findings.hiddenEndpoints.length + findings.hiddenDirectories.length;
    findings.summary.hasObfuscation = findings.obfuscatedFiles.length > 0;
    findings.summary.hasWebSockets = findings.websockets.length > 0;

    return findings;
}

export { HIDDEN_DIRECTORIES, COMMENT_PATTERNS, OBFUSCATION_PATTERNS };
