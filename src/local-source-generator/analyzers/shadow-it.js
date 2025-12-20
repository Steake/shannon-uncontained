/**
 * Shadow IT Hunter
 * 
 * Discovers forgotten infrastructure, cloud assets, dev environments,
 * and leaked credentials/configurations.
 */

import { withTimeout } from '../utils/resilience.js';

/**
 * Cloud provider IP ranges and signatures
 */
const CLOUD_SIGNATURES = {
    aws: {
        patterns: ['amazonaws.com', 'aws.amazon.com', 'cloudfront.net', 's3.'],
        headers: ['x-amz-', 'x-amzn-'],
        bucketPattern: /s3[.-][\w-]+\.amazonaws\.com|[\w-]+\.s3\.[\w-]+\.amazonaws\.com/gi
    },
    azure: {
        patterns: ['azure.com', 'azurewebsites.net', 'blob.core.windows.net'],
        headers: ['x-ms-'],
        bucketPattern: /[\w-]+\.blob\.core\.windows\.net/gi
    },
    gcp: {
        patterns: ['googleapis.com', 'storage.cloud.google.com', 'appspot.com'],
        headers: ['x-goog-'],
        bucketPattern: /storage\.googleapis\.com\/[\w-]+|[\w-]+\.storage\.googleapis\.com/gi
    },
    digitalocean: {
        patterns: ['digitalocean.com', 'digitaloceanspaces.com'],
        headers: [],
        bucketPattern: /[\w-]+\.[\w-]+\.digitaloceanspaces\.com/gi
    }
};

/**
 * Dev/staging environment indicators
 */
const DEV_INDICATORS = {
    subdomains: [
        'dev', 'development', 'staging', 'stage', 'stg', 'test', 'testing',
        'qa', 'uat', 'beta', 'alpha', 'preview', 'demo', 'sandbox',
        'preprod', 'pre-prod', 'internal', 'admin-dev', 'api-dev'
    ],
    paths: [
        '/dev/', '/test/', '/staging/', '/debug/', '/admin/debug',
        '/_debug', '/__debug', '/phpinfo.php', '/server-status',
        '/elmah.axd', '/trace.axd', '/.env', '/config.php.bak'
    ],
    files: [
        '.env', '.env.local', '.env.development', '.env.staging',
        'config.yml', 'database.yml', 'secrets.yml',
        'wp-config.php.bak', 'web.config.bak'
    ]
};

/**
 * Git leakage paths
 */
const GIT_LEAK_PATHS = [
    '/.git/HEAD',
    '/.git/config',
    '/.git/index',
    '/.git/logs/HEAD',
    '/.gitignore',
    '/.svn/entries',
    '/.svn/wc.db',
    '/.hg/store',
    '/.bzr/README'
];

/**
 * Extract S3/cloud bucket references from content
 * 
 * @param {string} content - HTML/JS content to analyze
 * @returns {Array} - Discovered bucket references
 */
export function extractCloudBuckets(content) {
    const buckets = [];

    if (!content || typeof content !== 'string') return buckets;

    for (const [provider, config] of Object.entries(CLOUD_SIGNATURES)) {
        const matches = content.match(config.bucketPattern) || [];

        for (const match of matches) {
            buckets.push({
                provider,
                url: match,
                type: 'storage',
                risk: 'Potential data exposure if misconfigured'
            });
        }
    }

    return [...new Map(buckets.map(b => [b.url, b])).values()];
}

/**
 * Identify potential dev/staging environments from subdomains
 * 
 * @param {Array} subdomains - Discovered subdomains
 * @returns {Array} - Identified dev environments
 */
export function identifyDevEnvironments(subdomains) {
    const devEnvs = [];

    for (const subdomain of subdomains) {
        const subLower = subdomain.toLowerCase();

        for (const indicator of DEV_INDICATORS.subdomains) {
            if (subLower.includes(indicator) || subLower.startsWith(indicator)) {
                devEnvs.push({
                    subdomain,
                    indicator,
                    type: 'dev_environment',
                    risk: 'high',
                    description: 'Potential development/staging environment',
                    recommendation: 'Check for weaker security controls and debug features'
                });
                break;
            }
        }
    }

    return devEnvs;
}

/**
 * Check for Git repository leakage
 * 
 * @param {string} baseUrl - Target base URL
 * @returns {Promise<Object>} - Git leak detection results
 */
export async function checkGitLeakage(baseUrl) {
    const results = {
        exposed: false,
        paths: [],
        reconstructable: false
    };

    for (const gitPath of GIT_LEAK_PATHS) {
        try {
            const url = new URL(gitPath, baseUrl).toString();
            const response = await withTimeout(
                () => fetch(url, { method: 'HEAD' }),
                3000,
                `Git check: ${gitPath}`
            );

            if (response.ok || response.status === 403) {
                results.exposed = true;
                results.paths.push({
                    path: gitPath,
                    status: response.status,
                    accessible: response.ok
                });

                if (gitPath === '/.git/HEAD' && response.ok) {
                    results.reconstructable = true;
                }
            }
        } catch {
            // Path not accessible
        }
    }

    return results;
}

/**
 * Scan for sensitive file exposure
 * 
 * @param {string} baseUrl - Target base URL
 * @returns {Promise<Array>} - Exposed sensitive files
 */
export async function scanSensitiveFiles(baseUrl) {
    const exposed = [];

    const sensitivePaths = [
        ...DEV_INDICATORS.files.map(f => '/' + f),
        ...DEV_INDICATORS.paths,
        '/robots.txt',
        '/sitemap.xml',
        '/crossdomain.xml',
        '/clientaccesspolicy.xml',
        '/.well-known/security.txt',
        '/backup.zip',
        '/backup.sql',
        '/dump.sql',
        '/database.sql'
    ];

    for (const sensitivePath of sensitivePaths) {
        try {
            const url = new URL(sensitivePath, baseUrl).toString();
            const response = await withTimeout(
                () => fetch(url, { method: 'HEAD' }),
                3000,
                `Sensitive file check: ${sensitivePath}`
            );

            if (response.ok) {
                const contentLength = response.headers.get('content-length');

                exposed.push({
                    path: sensitivePath,
                    url,
                    size: contentLength ? parseInt(contentLength) : null,
                    contentType: response.headers.get('content-type'),
                    risk: classifySensitiveFileRisk(sensitivePath)
                });
            }
        } catch {
            // Not accessible
        }
    }

    return exposed;
}

/**
 * Correlate discovered assets with cloud providers
 * 
 * @param {Object} reconData - Reconnaissance data
 * @returns {Object} - Cloud asset correlation
 */
export function correlateCloudAssets(reconData) {
    const correlation = {
        providers: {},
        assets: [],
        summary: {}
    };

    // Check URLs for cloud patterns
    const allUrls = [
        ...(reconData.endpoints || []).map(e => e.source || e.path),
        ...(reconData.jsFiles || []).map(j => j.url),
        ...(reconData.subdomains || [])
    ].filter(Boolean);

    for (const url of allUrls) {
        for (const [provider, config] of Object.entries(CLOUD_SIGNATURES)) {
            if (config.patterns.some(p => url.includes(p))) {
                if (!correlation.providers[provider]) {
                    correlation.providers[provider] = [];
                }
                correlation.providers[provider].push(url);
            }
        }
    }

    // Generate summary
    for (const [provider, urls] of Object.entries(correlation.providers)) {
        correlation.summary[provider] = urls.length;
    }

    return correlation;
}

/**
 * Comprehensive shadow IT scan
 * 
 * @param {string} baseUrl - Target URL
 * @param {Object} reconData - Reconnaissance data
 * @returns {Promise<Object>} - Complete shadow IT findings
 */
export async function huntShadowIT(baseUrl, reconData) {
    const findings = {
        cloudBuckets: [],
        devEnvironments: [],
        gitLeakage: null,
        sensitiveFiles: [],
        cloudCorrelation: null,
        riskScore: 0
    };

    // Extract cloud buckets from JS content
    for (const jsFile of reconData.jsFiles || []) {
        if (jsFile.content) {
            findings.cloudBuckets.push(...extractCloudBuckets(jsFile.content));
        }
    }

    // Identify dev environments
    if (reconData.subdomains) {
        findings.devEnvironments = identifyDevEnvironments(reconData.subdomains.split('\n').filter(Boolean));
    }

    // Check git leakage
    findings.gitLeakage = await checkGitLeakage(baseUrl);

    // Scan sensitive files
    findings.sensitiveFiles = await scanSensitiveFiles(baseUrl);

    // Correlate cloud assets
    findings.cloudCorrelation = correlateCloudAssets(reconData);

    // Calculate risk score
    findings.riskScore = calculateShadowITRisk(findings);

    return findings;
}

// Helper functions

function classifySensitiveFileRisk(path) {
    if (path.includes('.env') || path.includes('config') || path.includes('secret')) {
        return 'critical';
    }
    if (path.includes('.git') || path.includes('backup') || path.includes('.sql')) {
        return 'high';
    }
    if (path.includes('debug') || path.includes('phpinfo')) {
        return 'medium';
    }
    return 'low';
}

function calculateShadowITRisk(findings) {
    let score = 0;

    if (findings.gitLeakage?.reconstructable) score += 30;
    else if (findings.gitLeakage?.exposed) score += 15;

    score += findings.cloudBuckets.length * 10;
    score += findings.devEnvironments.length * 8;
    score += findings.sensitiveFiles.filter(f => f.risk === 'critical').length * 20;
    score += findings.sensitiveFiles.filter(f => f.risk === 'high').length * 10;

    return Math.min(score, 100);
}

export { CLOUD_SIGNATURES, DEV_INDICATORS, GIT_LEAK_PATHS };
