/**
 * Technology Fingerprinter
 * 
 * Enhanced technology detection and fingerprinting for black-box reconnaissance.
 * Integrates with whatweb output and adds framework/CMS/WAF detection.
 */

import { $ } from 'zx';
import { withTimeout, withFallback } from '../utils/resilience.js';

/**
 * Technology signatures for fingerprinting
 */
const TECH_SIGNATURES = {
    frameworks: {
        react: {
            patterns: ['react', 'reactjs', '__REACT_DEVTOOLS_GLOBAL_HOOK__', 'data-reactroot'],
            headers: [],
            files: ['react.js', 'react.min.js', 'react-dom']
        },
        angular: {
            patterns: ['ng-app', 'ng-controller', 'angular', 'ng-version'],
            headers: [],
            files: ['angular.js', 'angular.min.js', '@angular/core']
        },
        vue: {
            patterns: ['Vue.js', 'v-if', 'v-for', 'v-model', '__VUE__'],
            headers: [],
            files: ['vue.js', 'vue.min.js', 'vue.runtime']
        },
        nextjs: {
            patterns: ['_next/static', '__NEXT_DATA__', 'next/head'],
            headers: ['x-powered-by: Next.js'],
            files: ['_next/']
        },
        nuxt: {
            patterns: ['_nuxt/', '__NUXT__', 'nuxt-link'],
            headers: [],
            files: ['_nuxt/']
        },
        rails: {
            patterns: ['csrf-token', 'authenticity_token', 'rails-ujs'],
            headers: ['x-powered-by: Phusion Passenger'],
            files: []
        },
        django: {
            patterns: ['csrfmiddlewaretoken', 'django'],
            headers: [],
            files: []
        },
        laravel: {
            patterns: ['laravel_session', 'XSRF-TOKEN'],
            headers: ['x-powered-by: PHP'],
            files: []
        },
        express: {
            patterns: [],
            headers: ['x-powered-by: Express'],
            files: []
        },
        spring: {
            patterns: ['_csrf', 'jsessionid'],
            headers: [],
            files: []
        }
    },

    cms: {
        wordpress: {
            patterns: ['wp-content', 'wp-includes', 'wp-json', 'wordpress'],
            headers: [],
            files: ['wp-login.php', 'wp-admin', 'xmlrpc.php']
        },
        drupal: {
            patterns: ['Drupal.settings', 'drupal.js', 'sites/default'],
            headers: ['x-drupal-cache', 'x-generator: Drupal'],
            files: ['/node/', '/admin/content']
        },
        joomla: {
            patterns: ['Joomla!', 'joomla', 'com_content'],
            headers: [],
            files: ['/administrator/', '/components/', '/modules/']
        },
        shopify: {
            patterns: ['cdn.shopify.com', 'shopify.com/s/files'],
            headers: [],
            files: []
        },
        magento: {
            patterns: ['Mage.', 'mage/', 'magento'],
            headers: [],
            files: ['/skin/frontend/', '/js/mage/']
        }
    },

    waf: {
        cloudflare: {
            patterns: [],
            headers: ['cf-ray', 'cf-cache-status', 'server: cloudflare'],
            cookies: ['__cfduid', 'cf_clearance']
        },
        akamai: {
            patterns: [],
            headers: ['x-akamai-', 'akamai-'],
            cookies: ['ak_bmsc', 'bm_sz']
        },
        awsWaf: {
            patterns: [],
            headers: ['x-amzn-requestid', 'x-amz-cf-id'],
            cookies: ['awsalb', 'awsalbcors']
        },
        imperva: {
            patterns: [],
            headers: ['x-iinfo'],
            cookies: ['incap_ses', 'visid_incap']
        },
        sucuri: {
            patterns: [],
            headers: ['x-sucuri-id', 'x-sucuri-cache'],
            cookies: []
        }
    },

    cdn: {
        cloudflare: {
            headers: ['server: cloudflare', 'cf-ray']
        },
        akamai: {
            headers: ['x-akamai-transformed']
        },
        fastly: {
            headers: ['x-served-by', 'x-cache: HIT']
        },
        cloudfront: {
            headers: ['x-amz-cf-id', 'x-amz-cf-pop']
        }
    }
};

/**
 * Parse whatweb output into structured format
 * 
 * @param {string} output - Raw whatweb output
 * @returns {Object} - Structured technology info
 */
export function parseWhatwebOutput(output) {
    const result = {
        url: '',
        technologies: [],
        headers: {},
        raw: output
    };

    if (!output || typeof output !== 'string') {
        return result;
    }

    // Extract URL
    const urlMatch = output.match(/^(https?:\/\/[^\s\[]+)/);
    if (urlMatch) {
        result.url = urlMatch[1];
    }

    // Extract technologies - whatweb format: [Technology Name], [Another[version]]
    const techMatches = output.matchAll(/\[([^\]]+)\]/g);
    for (const match of techMatches) {
        const tech = match[1];

        // Check for version: Technology[version]
        const versionMatch = tech.match(/^([^[]+)\[([^\]]+)\]$/);
        if (versionMatch) {
            result.technologies.push({
                name: versionMatch[1].trim(),
                version: versionMatch[2].trim()
            });
        } else {
            result.technologies.push({
                name: tech.trim(),
                version: null
            });
        }
    }

    return result;
}

/**
 * Fingerprint technologies from HTML content
 * 
 * @param {string} html - HTML content
 * @returns {Object} - Detected technologies
 */
export function fingerprintFromHTML(html) {
    const detected = {
        frameworks: [],
        cms: [],
        other: []
    };

    if (!html) return detected;

    const htmlLower = html.toLowerCase();

    // Check frameworks
    for (const [name, sig] of Object.entries(TECH_SIGNATURES.frameworks)) {
        for (const pattern of sig.patterns) {
            if (htmlLower.includes(pattern.toLowerCase())) {
                detected.frameworks.push({
                    name,
                    confidence: 0.7,
                    matchedPattern: pattern
                });
                break;
            }
        }
    }

    // Check CMS
    for (const [name, sig] of Object.entries(TECH_SIGNATURES.cms)) {
        for (const pattern of sig.patterns) {
            if (htmlLower.includes(pattern.toLowerCase())) {
                detected.cms.push({
                    name,
                    confidence: 0.8,
                    matchedPattern: pattern
                });
                break;
            }
        }
    }

    return detected;
}

/**
 * Fingerprint from HTTP headers
 * 
 * @param {Object} headers - HTTP response headers
 * @returns {Object} - Detected technologies
 */
export function fingerprintFromHeaders(headers) {
    const detected = {
        waf: [],
        cdn: [],
        server: null,
        poweredBy: null
    };

    if (!headers) return detected;

    const headersLower = {};
    for (const [key, value] of Object.entries(headers)) {
        headersLower[key.toLowerCase()] = String(value).toLowerCase();
    }

    // Extract server info
    if (headersLower['server']) {
        detected.server = headers['server'] || headersLower['server'];
    }

    if (headersLower['x-powered-by']) {
        detected.poweredBy = headers['x-powered-by'] || headersLower['x-powered-by'];
    }

    // Check WAF signatures
    for (const [name, sig] of Object.entries(TECH_SIGNATURES.waf)) {
        for (const headerPattern of sig.headers) {
            const [headerName, headerValue] = headerPattern.split(':').map(s => s.trim().toLowerCase());

            if (headersLower[headerName]) {
                if (!headerValue || headersLower[headerName].includes(headerValue)) {
                    detected.waf.push({
                        name,
                        confidence: 0.9,
                        evidence: `${headerName}: ${headersLower[headerName]}`
                    });
                    break;
                }
            }
        }
    }

    // Check CDN signatures
    for (const [name, sig] of Object.entries(TECH_SIGNATURES.cdn)) {
        for (const headerPattern of sig.headers) {
            const [headerName, headerValue] = headerPattern.split(':').map(s => s.trim().toLowerCase());

            if (headersLower[headerName]) {
                if (!headerValue || headersLower[headerName].includes(headerValue)) {
                    detected.cdn.push({
                        name,
                        confidence: 0.85,
                        evidence: `${headerName}: ${headersLower[headerName]}`
                    });
                    break;
                }
            }
        }
    }

    return detected;
}

/**
 * Enhanced whatweb scan with structured output
 * 
 * @param {string} url - Target URL
 * @returns {Promise<Object>} - Structured whatweb results
 */
export async function runEnhancedWhatweb(url) {
    return withFallback(
        () => withTimeout(
            async () => {
                const result = await $`whatweb --color=never -a 3 ${url}`;
                return parseWhatwebOutput(result.stdout);
            },
            60000,
            'whatweb scan'
        ),
        { technologies: [], raw: 'whatweb scan failed' },
        { operationName: 'Enhanced whatweb' }
    );
}

/**
 * Comprehensive technology fingerprint
 * 
 * @param {Object} data - Reconnaissance data
 * @returns {Object} - Complete fingerprint
 */
export function generateTechFingerprint(data) {
    const fingerprint = {
        detected: {
            frameworks: [],
            cms: [],
            waf: [],
            cdn: [],
            server: null,
            language: null
        },
        raw: {},
        confidence: 0
    };

    // Merge whatweb results
    if (data.whatweb) {
        const parsed = typeof data.whatweb === 'string'
            ? parseWhatwebOutput(data.whatweb)
            : data.whatweb;

        fingerprint.raw.whatweb = parsed;

        for (const tech of parsed.technologies || []) {
            // Categorize technology
            const techLower = tech.name.toLowerCase();

            if (techLower.includes('php') || techLower.includes('python') ||
                techLower.includes('ruby') || techLower.includes('java') ||
                techLower.includes('node') || techLower.includes('.net')) {
                fingerprint.detected.language = tech.name;
            }
        }
    }

    // Merge HTML fingerprinting
    if (data.html) {
        const htmlFingerprint = fingerprintFromHTML(data.html);
        fingerprint.detected.frameworks.push(...htmlFingerprint.frameworks);
        fingerprint.detected.cms.push(...htmlFingerprint.cms);
    }

    // Merge header fingerprinting
    if (data.headers) {
        const headerFingerprint = fingerprintFromHeaders(data.headers);
        fingerprint.detected.waf.push(...headerFingerprint.waf);
        fingerprint.detected.cdn.push(...headerFingerprint.cdn);
        fingerprint.detected.server = headerFingerprint.server;
    }

    // Calculate overall confidence
    const itemCount = fingerprint.detected.frameworks.length +
        fingerprint.detected.cms.length +
        fingerprint.detected.waf.length;
    fingerprint.confidence = Math.min(0.5 + (itemCount * 0.1), 0.95);

    return fingerprint;
}

export { TECH_SIGNATURES };
