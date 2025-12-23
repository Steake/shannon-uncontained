/**
 * Endpoint Prober - HTTP utility for ground-truth validation
 * Probes endpoints to determine actual server behavior
 */

import chalk from 'chalk';

const DEFAULT_TIMEOUT = 10000;
const USER_AGENT = 'Shannon-GroundTruth/1.0 (Security Assessment)';

/**
 * Probe a single endpoint and return observed behavior
 */
export async function probeEndpoint(url, options = {}) {
    const method = options.method || 'GET';
    const headers = {
        'User-Agent': USER_AGENT,
        ...options.headers
    };

    const result = {
        url,
        method,
        probed: new Date().toISOString(),
        status: null,
        statusText: null,
        redirects: [],
        finalUrl: url,
        responseTime: null,
        contentType: null,
        contentLength: null,
        securityHeaders: {},
        error: null,
        confidence: 'HIGH'
    };

    const startTime = Date.now();

    try {
        // First request without following redirects to capture redirect chain
        const initialResponse = await fetch(url, {
            method,
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
        });

        result.status = initialResponse.status;
        result.statusText = initialResponse.statusText;
        result.contentType = initialResponse.headers.get('content-type');
        result.contentLength = initialResponse.headers.get('content-length');

        // Capture security headers
        const securityHeaderNames = [
            'strict-transport-security',
            'content-security-policy',
            'x-content-type-options',
            'x-frame-options',
            'x-xss-protection'
        ];

        for (const headerName of securityHeaderNames) {
            const value = initialResponse.headers.get(headerName);
            if (value) {
                result.securityHeaders[headerName] = value;
            }
        }

        // Follow redirects manually to capture chain
        let currentUrl = url;
        let redirectCount = 0;
        const maxRedirects = 5;

        while (initialResponse.status >= 300 && initialResponse.status < 400 && redirectCount < maxRedirects) {
            const location = initialResponse.headers.get('location');
            if (!location) break;

            const nextUrl = new URL(location, currentUrl).href;
            result.redirects.push({
                from: currentUrl,
                to: nextUrl,
                status: initialResponse.status
            });

            currentUrl = nextUrl;
            redirectCount++;

            // Fetch final destination
            const finalResponse = await fetch(nextUrl, {
                method: 'GET',
                headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
            });

            if (finalResponse.status < 300 || finalResponse.status >= 400) {
                result.finalUrl = nextUrl;
                result.status = finalResponse.status;
                result.statusText = finalResponse.statusText;
                break;
            }
        }

        result.responseTime = Date.now() - startTime;

    } catch (error) {
        result.error = error.message;
        result.confidence = 'LOW';
        result.responseTime = Date.now() - startTime;
    }

    return result;
}

/**
 * Probe multiple endpoints in parallel with rate limiting
 */
export async function probeEndpoints(endpoints, options = {}) {
    const concurrency = options.concurrency || 3;
    const delay = options.delay || 500;
    const results = [];

    console.log(chalk.gray(`  Probing ${endpoints.length} endpoints (concurrency: ${concurrency})`));

    for (let i = 0; i < endpoints.length; i += concurrency) {
        const batch = endpoints.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(ep => probeEndpoint(ep.url, { method: ep.method }))
        );
        results.push(...batchResults);

        // Progress indicator
        const progress = Math.min(i + concurrency, endpoints.length);
        process.stdout.write(`\r  Progress: ${progress}/${endpoints.length}`);

        // Rate limiting delay between batches
        if (i + concurrency < endpoints.length) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    console.log(''); // Newline after progress

    return results;
}

/**
 * Classify endpoint behavior based on probe results
 */
export function classifyBehavior(probeResult) {
    const { status, redirects, error } = probeResult;

    if (error) {
        return {
            classification: 'ERROR',
            authRequired: 'UNKNOWN',
            exists: 'UNKNOWN',
            note: `Probe failed: ${error}`
        };
    }

    if (status === 200) {
        return {
            classification: 'ACCESSIBLE',
            authRequired: false,
            exists: true,
            note: 'Endpoint accessible without authentication'
        };
    }

    if (status === 401 || status === 403) {
        return {
            classification: 'PROTECTED',
            authRequired: true,
            exists: true,
            note: `Access denied (HTTP ${status})`
        };
    }

    if (status === 404) {
        return {
            classification: 'NOT_FOUND',
            authRequired: 'N/A',
            exists: false,
            note: 'Endpoint does not exist'
        };
    }

    if (status >= 300 && status < 400) {
        const finalDest = redirects.length > 0 ? redirects[redirects.length - 1].to : 'unknown';
        return {
            classification: 'REDIRECT',
            authRequired: 'UNKNOWN',
            exists: true,
            note: `Redirects to ${finalDest}`
        };
    }

    if (status >= 500) {
        return {
            classification: 'SERVER_ERROR',
            authRequired: 'UNKNOWN',
            exists: 'UNKNOWN',
            note: `Server error (HTTP ${status})`
        };
    }

    return {
        classification: 'UNKNOWN',
        authRequired: 'UNKNOWN',
        exists: 'UNKNOWN',
        note: `Unexpected status: ${status}`
    };
}
