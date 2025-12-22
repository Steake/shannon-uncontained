/**
 * ErrorPatternAnalyzer - Detects stack traces and verbose error messages.
 * 
 * Covers WSTG items:
 * - WSTG-ERRH-01: Testing for Improper Error Handling
 * - WSTG-ERRH-02: Testing for Stack Traces
 */

// Stack trace patterns for different languages/frameworks
const STACK_TRACE_PATTERNS = [
    // Java
    { name: 'java', pattern: /at\s+[\w.$]+\.([\w$]+)\([\w$]+\.java:\d+\)/i },
    { name: 'java_exception', pattern: /java\.(lang|io|sql|net)\.\w+Exception/i },

    // Python
    { name: 'python', pattern: /File\s+"[^"]+",\s+line\s+\d+,\s+in\s+\w+/i },
    { name: 'python_traceback', pattern: /Traceback\s+\(most\s+recent\s+call\s+last\)/i },

    // PHP
    { name: 'php', pattern: /Fatal\s+error:\s+.*\s+in\s+\/[\w\/.-]+\.php\s+on\s+line\s+\d+/i },
    { name: 'php_stack', pattern: /#\d+\s+\/[\w\/.-]+\.php\(\d+\):/i },

    // Node.js / JavaScript
    { name: 'nodejs', pattern: /at\s+[\w.$]+\s+\(\/[\w\/.-]+\.js:\d+:\d+\)/i },
    { name: 'nodejs_internal', pattern: /at\s+[\w.$]+\s+\(node:internal\/[\w\/.-]+:\d+:\d+\)/i },

    // .NET / C#
    { name: 'dotnet', pattern: /at\s+[\w.]+\.[<>]+\w+\(.*\)\s+in\s+[\w:\\\/]+\.cs:line\s+\d+/i },
    { name: 'aspnet', pattern: /Server\s+Error\s+in\s+'\/[\w]*'\s+Application/i },

    // Ruby
    { name: 'ruby', pattern: /\/[\w\/.-]+\.rb:\d+:in\s+`[\w]+'/i },

    // Go
    { name: 'golang', pattern: /goroutine\s+\d+\s+\[running\]:/i }
];

// SQL error patterns
const SQL_ERROR_PATTERNS = [
    { name: 'mysql', pattern: /You have an error in your SQL syntax/i },
    { name: 'mysql_errno', pattern: /mysql_fetch_array\(\)|mysqli_fetch/i },
    { name: 'postgresql', pattern: /ERROR:\s+syntax error at or near/i },
    { name: 'mssql', pattern: /Microsoft\s+OLE\s+DB\s+Provider\s+for\s+SQL\s+Server/i },
    { name: 'oracle', pattern: /ORA-\d{5}:/i },
    { name: 'sqlite', pattern: /SQLite3?::SQLException/i }
];

// Debug/verbose mode indicators
const DEBUG_PATTERNS = [
    { name: 'debug_mode', pattern: /DEBUG["']?\s*[:=]\s*["']?true|"DEBUG"\s*:\s*true/i },
    { name: 'environment', pattern: /DEVELOPMENT|STAGING|NODE_ENV/i },
    { name: 'path_disclosure', pattern: /\/home\/[\w]+\/|C:\\Users\\[\w]+\\/i },
    { name: 'config_exposed', pattern: /database\.password|DB_PASSWORD|SECRET_KEY/i }
];

/**
 * Analyze responses for error patterns and stack traces
 * @param {Object[]} responses - Array of {url, body, statusCode}
 * @returns {Object[]} Array of findings with EQBSL tensors
 */
export function analyzeErrorPatterns(responses) {
    const findings = [];

    for (const response of responses) {
        const { url, body, statusCode } = response;

        if (!body || typeof body !== 'string') {
            continue;
        }

        // Only analyze error responses or look for patterns in all responses
        const isErrorResponse = statusCode >= 400;

        // Check for stack traces (WSTG-ERRH-02)
        for (const { name, pattern } of STACK_TRACE_PATTERNS) {
            if (pattern.test(body)) {
                findings.push({
                    type: 'stack_trace_exposed',
                    wstgId: 'WSTG-ERRH-02',
                    subject: url,
                    predicate: 'exposes_stack_trace',
                    object: name,
                    severity: 'high',
                    description: `Response contains ${name} stack trace`,
                    eqbsl: { b: 0.95, d: 0.01, u: 0.04, a: 0.5 }
                });
                break; // One finding per response for stack traces
            }
        }

        // Check for SQL errors
        for (const { name, pattern } of SQL_ERROR_PATTERNS) {
            if (pattern.test(body)) {
                findings.push({
                    type: 'sql_error_exposed',
                    wstgId: 'WSTG-ERRH-01',
                    subject: url,
                    predicate: 'exposes_sql_error',
                    object: name,
                    severity: 'high',
                    description: `Response contains ${name} database error message`,
                    eqbsl: { b: 0.92, d: 0.02, u: 0.06, a: 0.5 }
                });
                break; // One finding per response for SQL errors
            }
        }

        // Check for debug indicators
        for (const { name, pattern } of DEBUG_PATTERNS) {
            if (pattern.test(body)) {
                findings.push({
                    type: 'debug_info_exposed',
                    wstgId: 'WSTG-ERRH-01',
                    subject: url,
                    predicate: 'exposes_debug_info',
                    object: name,
                    severity: name === 'config_exposed' ? 'critical' : 'medium',
                    description: `Response contains sensitive debug information: ${name}`,
                    eqbsl: getDebugInfoEqbsl(name)
                });
            }
        }

        // Check for verbose error messages in error responses
        if (isErrorResponse && body.length > 500) {
            const hasDetailedError = /exception|error|failed|invalid|denied/i.test(body);
            if (hasDetailedError) {
                findings.push({
                    type: 'verbose_error',
                    wstgId: 'WSTG-ERRH-01',
                    subject: url,
                    predicate: 'verbose_error_response',
                    object: statusCode,
                    severity: 'low',
                    description: `Error response (${statusCode}) contains detailed error message`,
                    eqbsl: { b: 0.75, d: 0.10, u: 0.15, a: 0.5 }
                });
            }
        }
    }

    return findings;
}

/**
 * Get EQBSL tensor for debug info findings
 */
function getDebugInfoEqbsl(type) {
    const severity = {
        'config_exposed': { b: 0.98, d: 0.01, u: 0.01, a: 0.5 },
        'path_disclosure': { b: 0.88, d: 0.04, u: 0.08, a: 0.5 },
        'environment': { b: 0.80, d: 0.08, u: 0.12, a: 0.5 },
        'debug_mode': { b: 0.85, d: 0.05, u: 0.10, a: 0.5 }
    };
    return severity[type] || { b: 0.75, d: 0.10, u: 0.15, a: 0.5 };
}

export default { analyzeErrorPatterns };
