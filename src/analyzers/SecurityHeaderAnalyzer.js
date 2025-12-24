/**
 * SecurityHeaderAnalyzer - Analyzes HTTP response headers for security misconfigurations.
 * 
 * Covers WSTG items:
 * - WSTG-CONF-07: HTTP Strict Transport Security (HSTS)
 * - WSTG-CONF-14: HTTP Security Header Misconfigurations
 * - WSTG-CLNT-07: Cross Origin Resource Sharing (CORS)
 * - WSTG-CLNT-09: Clickjacking (X-Frame-Options, CSP frame-ancestors)
 */

// Minimum HSTS max-age for security (1 year = 31536000)
const MIN_HSTS_MAX_AGE = 31536000;

/**
 * Analyze security headers from HTTP responses
 * @param {Object[]} responses - Array of {url, headers, statusCode}
 * @returns {Object[]} Array of findings with EQBSL tensors
 */
export function analyzeSecurityHeaders(responses) {
    const findings = [];

    for (const response of responses) {
        const { url, headers } = response;
        const normalizedHeaders = normalizeHeaders(headers);

        // WSTG-CONF-07: HSTS
        const hstsFindings = checkHSTS(url, normalizedHeaders);
        findings.push(...hstsFindings);

        // WSTG-CONF-14: Security Headers
        const headerFindings = checkSecurityHeaders(url, normalizedHeaders);
        findings.push(...headerFindings);

        // WSTG-CLNT-07: CORS
        const corsFindings = checkCORS(url, normalizedHeaders);
        findings.push(...corsFindings);

        // WSTG-CLNT-09: Clickjacking
        const clickjackingFindings = checkClickjacking(url, normalizedHeaders);
        findings.push(...clickjackingFindings);
    }

    return findings;
}

/**
 * Normalize headers to lowercase keys
 */
function normalizeHeaders(headers) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers || {})) {
        normalized[key.toLowerCase()] = value;
    }
    return normalized;
}

/**
 * Check HSTS header (WSTG-CONF-07)
 */
function checkHSTS(url, headers) {
    const findings = [];
    const hsts = headers['strict-transport-security'];

    if (!url.startsWith('https://')) {
        return findings; // HSTS only applies to HTTPS
    }

    if (!hsts) {
        findings.push({
            type: 'security_header_missing',
            wstgId: 'WSTG-CONF-07',
            subject: url,
            predicate: 'missing_hsts',
            object: true,
            severity: 'medium',
            description: 'HTTPS response lacks Strict-Transport-Security header',
            eqbsl: { b: 0.95, d: 0.02, u: 0.03, a: 0.5 }
        });
    } else {
        // Check max-age
        const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
        if (maxAgeMatch) {
            const maxAge = parseInt(maxAgeMatch[1], 10);
            if (maxAge < MIN_HSTS_MAX_AGE) {
                findings.push({
                    type: 'security_header_weak',
                    wstgId: 'WSTG-CONF-07',
                    subject: url,
                    predicate: 'weak_hsts_max_age',
                    object: maxAge,
                    severity: 'low',
                    description: `HSTS max-age (${maxAge}) is below recommended minimum (${MIN_HSTS_MAX_AGE})`,
                    eqbsl: { b: 0.85, d: 0.05, u: 0.10, a: 0.5 }
                });
            }
        }

        // Check for includeSubDomains
        if (!hsts.toLowerCase().includes('includesubdomains')) {
            findings.push({
                type: 'security_header_weak',
                wstgId: 'WSTG-CONF-07',
                subject: url,
                predicate: 'hsts_missing_includesubdomains',
                object: true,
                severity: 'info',
                description: 'HSTS header lacks includeSubDomains directive',
                eqbsl: { b: 0.80, d: 0.08, u: 0.12, a: 0.5 }
            });
        }
    }

    return findings;
}

/**
 * Check general security headers (WSTG-CONF-14)
 */
function checkSecurityHeaders(url, headers) {
    const findings = [];

    // X-Content-Type-Options
    if (!headers['x-content-type-options']?.toLowerCase().includes('nosniff')) {
        findings.push({
            type: 'security_header_missing',
            wstgId: 'WSTG-CONF-14',
            subject: url,
            predicate: 'missing_content_type_options',
            object: true,
            severity: 'low',
            description: 'Response lacks X-Content-Type-Options: nosniff header',
            eqbsl: { b: 0.90, d: 0.03, u: 0.07, a: 0.5 }
        });
    }

    // Referrer-Policy
    if (!headers['referrer-policy']) {
        findings.push({
            type: 'security_header_missing',
            wstgId: 'WSTG-CONF-14',
            subject: url,
            predicate: 'missing_referrer_policy',
            object: true,
            severity: 'info',
            description: 'Response lacks Referrer-Policy header',
            eqbsl: { b: 0.85, d: 0.05, u: 0.10, a: 0.5 }
        });
    }

    // Content-Security-Policy
    if (!headers['content-security-policy']) {
        findings.push({
            type: 'security_header_missing',
            wstgId: 'WSTG-CONF-14',
            subject: url,
            predicate: 'missing_csp',
            object: true,
            severity: 'medium',
            description: 'Response lacks Content-Security-Policy header',
            eqbsl: { b: 0.88, d: 0.04, u: 0.08, a: 0.5 }
        });
    }

    // Permissions-Policy (formerly Feature-Policy)
    if (!headers['permissions-policy'] && !headers['feature-policy']) {
        findings.push({
            type: 'security_header_missing',
            wstgId: 'WSTG-CONF-14',
            subject: url,
            predicate: 'missing_permissions_policy',
            object: true,
            severity: 'info',
            description: 'Response lacks Permissions-Policy header',
            eqbsl: { b: 0.80, d: 0.08, u: 0.12, a: 0.5 }
        });
    }

    return findings;
}

/**
 * Check CORS configuration (WSTG-CLNT-07)
 */
function checkCORS(url, headers) {
    const findings = [];
    const acao = headers['access-control-allow-origin'];
    const acac = headers['access-control-allow-credentials'];

    if (acao === '*') {
        findings.push({
            type: 'cors_misconfiguration',
            wstgId: 'WSTG-CLNT-07',
            subject: url,
            predicate: 'cors_wildcard_origin',
            object: true,
            severity: 'medium',
            description: 'CORS allows any origin (Access-Control-Allow-Origin: *)',
            eqbsl: { b: 0.92, d: 0.02, u: 0.06, a: 0.5 }
        });
    }

    if (acao && acac?.toLowerCase() === 'true') {
        findings.push({
            type: 'cors_misconfiguration',
            wstgId: 'WSTG-CLNT-07',
            subject: url,
            predicate: 'cors_credentials_with_origin',
            object: acao,
            severity: 'high',
            description: `CORS allows credentials with origin reflection: ${acao}`,
            eqbsl: { b: 0.95, d: 0.01, u: 0.04, a: 0.5 }
        });
    }

    return findings;
}

/**
 * Check Clickjacking protection (WSTG-CLNT-09)
 */
function checkClickjacking(url, headers) {
    const findings = [];
    const xfo = headers['x-frame-options'];
    const csp = headers['content-security-policy'];

    // Check X-Frame-Options
    const hasXFO = xfo && (
        xfo.toLowerCase() === 'deny' ||
        xfo.toLowerCase() === 'sameorigin'
    );

    // Check CSP frame-ancestors
    const hasFrameAncestors = csp && /frame-ancestors\s+('self'|'none'|https?:)/i.test(csp);

    if (!hasXFO && !hasFrameAncestors) {
        findings.push({
            type: 'clickjacking_vulnerable',
            wstgId: 'WSTG-CLNT-09',
            subject: url,
            predicate: 'missing_frame_protection',
            object: true,
            severity: 'medium',
            description: 'Response lacks clickjacking protection (no X-Frame-Options or CSP frame-ancestors)',
            eqbsl: { b: 0.90, d: 0.03, u: 0.07, a: 0.5 }
        });
    }

    return findings;
}

export default { analyzeSecurityHeaders };
