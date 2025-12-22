/**
 * HTTPMethodAnalyzer - Detects dangerous HTTP methods via OPTIONS probing.
 * 
 * Covers WSTG items:
 * - WSTG-CONF-06: Test HTTP Methods
 */

// Methods considered dangerous when exposed unexpectedly
const DANGEROUS_METHODS = ['PUT', 'DELETE', 'TRACE', 'CONNECT', 'PATCH'];

// Methods that are typically safe but should be noted if present
const NOTABLE_METHODS = ['OPTIONS', 'HEAD'];

/**
 * Analyze HTTP methods from OPTIONS responses
 * @param {Object[]} optionsResponses - Array of {url, allowedMethods}
 * @returns {Object[]} Array of findings with EQBSL tensors
 */
export function analyzeHTTPMethods(optionsResponses) {
    const findings = [];

    for (const response of optionsResponses) {
        const { url, allowedMethods } = response;

        if (!allowedMethods || allowedMethods.length === 0) {
            continue;
        }

        const methods = Array.isArray(allowedMethods)
            ? allowedMethods.map(m => m.toUpperCase())
            : String(allowedMethods).toUpperCase().split(/[,\s]+/).map(m => m.trim());

        // Check for dangerous methods
        for (const method of DANGEROUS_METHODS) {
            if (methods.includes(method)) {
                findings.push({
                    type: 'dangerous_http_method',
                    wstgId: 'WSTG-CONF-06',
                    subject: url,
                    predicate: 'allows_dangerous_method',
                    object: method,
                    severity: method === 'TRACE' ? 'high' : 'medium',
                    description: `Endpoint allows potentially dangerous HTTP method: ${method}`,
                    eqbsl: getDangerousMethodEqbsl(method)
                });
            }
        }

        // Check for TRACE specifically (XST vulnerability)
        if (methods.includes('TRACE')) {
            findings.push({
                type: 'xst_vulnerability',
                wstgId: 'WSTG-CONF-06',
                subject: url,
                predicate: 'vulnerable_to_xst',
                object: true,
                severity: 'high',
                description: 'TRACE method enabled - potential Cross-Site Tracing (XST) vulnerability',
                eqbsl: { b: 0.85, d: 0.05, u: 0.10, a: 0.5 }
            });
        }
    }

    return findings;
}

/**
 * Get EQBSL tensor for dangerous method finding
 */
function getDangerousMethodEqbsl(method) {
    const methodSeverity = {
        'TRACE': { b: 0.90, d: 0.03, u: 0.07, a: 0.5 },
        'PUT': { b: 0.85, d: 0.05, u: 0.10, a: 0.5 },
        'DELETE': { b: 0.85, d: 0.05, u: 0.10, a: 0.5 },
        'CONNECT': { b: 0.80, d: 0.08, u: 0.12, a: 0.5 },
        'PATCH': { b: 0.75, d: 0.10, u: 0.15, a: 0.5 }
    };
    return methodSeverity[method] || { b: 0.70, d: 0.12, u: 0.18, a: 0.5 };
}

/**
 * Parse Allow header from OPTIONS response
 * @param {string} allowHeader - Value of Allow header
 * @returns {string[]} Array of method names
 */
export function parseAllowHeader(allowHeader) {
    if (!allowHeader) return [];
    return allowHeader.split(',').map(m => m.trim().toUpperCase()).filter(Boolean);
}

export default { analyzeHTTPMethods, parseAllowHeader };
