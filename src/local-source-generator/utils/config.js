/**
 * Black-Box Configuration Module
 * 
 * Handles YAML config parsing for black-box reconnaissance with:
 * - Authenticated scanning
 * - Scope limiting (include/exclude patterns)
 * - Rate limiting
 */

import { fs } from 'zx';
import yaml from 'js-yaml';
import path from 'path';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    mode: 'black-box',
    reconnaissance: {
        aggressive_crawling: true,
        javascript_analysis: true,
        api_schema_discovery: true,
        max_depth: 3,
        timeout: 30
    },
    rate_limiting: {
        enabled: false,
        requests_per_second: 10,
        delay_between_tools: 1000,  // ms between tool invocations
        concurrent_requests: 5
    },
    scope: {
        include: [],  // Patterns to include (empty = all)
        exclude: []   // Patterns to exclude
    },
    authentication: null,
    rules: {
        avoid: [],
        focus: []
    }
};

/**
 * Load and parse a black-box configuration file
 * 
 * @param {string} configPath - Path to YAML config file
 * @returns {Promise<Object>} - Parsed and validated config
 */
export async function loadBlackboxConfig(configPath) {
    if (!configPath) {
        console.log('ℹ️  No config file specified, using defaults');
        return { ...DEFAULT_CONFIG };
    }

    // Resolve path (check configs folder if relative)
    let resolvedPath = configPath;
    if (!path.isAbsolute(configPath)) {
        const configsDir = path.join(process.cwd(), 'configs');
        const inConfigsDir = path.join(configsDir, configPath);
        const inBlackboxTemplates = path.join(configsDir, 'blackbox-templates', configPath);

        if (await fs.pathExists(inConfigsDir)) {
            resolvedPath = inConfigsDir;
        } else if (await fs.pathExists(inBlackboxTemplates)) {
            resolvedPath = inBlackboxTemplates;
        }
    }

    if (!await fs.pathExists(resolvedPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    try {
        const content = await fs.readFile(resolvedPath, 'utf8');
        const parsed = yaml.load(content);

        // Merge with defaults
        const config = mergeConfig(DEFAULT_CONFIG, parsed);

        console.log(`✅ Loaded config from: ${resolvedPath}`);
        return config;
    } catch (error) {
        throw new Error(`Failed to parse config file: ${error.message}`);
    }
}

/**
 * Deep merge config with defaults
 */
function mergeConfig(defaults, overrides) {
    const result = { ...defaults };

    for (const [key, value] of Object.entries(overrides || {})) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = mergeConfig(defaults[key] || {}, value);
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Check if a URL/path is in scope based on config rules
 * 
 * @param {string} url - URL to check
 * @param {Object} config - Configuration object
 * @returns {boolean} - True if in scope
 */
export function isInScope(url, config) {
    const scope = config.scope || {};
    const rules = config.rules || {};

    // Check explicit exclude patterns
    for (const pattern of scope.exclude || []) {
        if (matchesPattern(url, pattern)) {
            return false;
        }
    }

    // Check rules.avoid
    for (const rule of rules.avoid || []) {
        if (matchesRule(url, rule)) {
            return false;
        }
    }

    // Check explicit include patterns (if any defined)
    const includePatterns = scope.include || [];
    if (includePatterns.length > 0) {
        const matches = includePatterns.some(pattern => matchesPattern(url, pattern));
        if (!matches) {
            return false;
        }
    }

    return true;
}

/**
 * Check if a URL should be prioritized based on focus rules
 * 
 * @param {string} url - URL to check
 * @param {Object} config - Configuration object
 * @returns {boolean} - True if should be prioritized
 */
export function shouldPrioritize(url, config) {
    const rules = config.rules || {};

    for (const rule of rules.focus || []) {
        if (matchesRule(url, rule)) {
            return true;
        }
    }

    return false;
}

/**
 * Match URL against a pattern (glob-like)
 */
function matchesPattern(url, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    try {
        const regex = new RegExp(regexPattern, 'i');
        return regex.test(url);
    } catch {
        return false;
    }
}

/**
 * Match URL against a scope rule
 */
function matchesRule(url, rule) {
    if (!rule || !rule.type || !rule.url_path) {
        return false;
    }

    try {
        const parsedUrl = new URL(url);

        switch (rule.type) {
            case 'path':
                return matchesPattern(parsedUrl.pathname, rule.url_path);

            case 'subdomain':
                return parsedUrl.hostname.startsWith(rule.url_path + '.') ||
                    parsedUrl.hostname === rule.url_path;

            case 'domain':
                return parsedUrl.hostname.includes(rule.url_path);

            case 'regex':
                return new RegExp(rule.url_path, 'i').test(url);

            default:
                return matchesPattern(url, rule.url_path);
        }
    } catch {
        return false;
    }
}

/**
 * Rate limiter class for controlling request frequency
 */
export class RateLimiter {
    constructor(config) {
        const rateConfig = config.rate_limiting || {};
        this.enabled = rateConfig.enabled || false;
        this.requestsPerSecond = rateConfig.requests_per_second || 10;
        this.delayBetweenTools = rateConfig.delay_between_tools || 1000;
        this.maxConcurrent = rateConfig.concurrent_requests || 5;

        this.lastRequestTime = 0;
        this.activeRequests = 0;
    }

    /**
     * Wait for rate limit before proceeding
     */
    async acquire() {
        if (!this.enabled) {
            return;
        }

        // Wait for concurrent limit
        while (this.activeRequests >= this.maxConcurrent) {
            await this.sleep(100);
        }

        // Enforce delay between requests
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        const minDelay = 1000 / this.requestsPerSecond;

        if (elapsed < minDelay) {
            await this.sleep(minDelay - elapsed);
        }

        this.lastRequestTime = Date.now();
        this.activeRequests++;
    }

    /**
     * Release rate limit slot
     */
    release() {
        if (this.activeRequests > 0) {
            this.activeRequests--;
        }
    }

    /**
     * Wait between tool invocations
     */
    async waitBetweenTools() {
        if (this.enabled && this.delayBetweenTools > 0) {
            await this.sleep(this.delayBetweenTools);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Filter endpoints based on scope configuration
 * 
 * @param {Array} endpoints - Array of discovered endpoints
 * @param {Object} config - Configuration object
 * @returns {Object} - { included: [], excluded: [], prioritized: [] }
 */
export function filterEndpointsByScope(endpoints, config) {
    const included = [];
    const excluded = [];
    const prioritized = [];

    for (const endpoint of endpoints) {
        const url = endpoint.url || endpoint.path || endpoint;

        if (!isInScope(url, config)) {
            excluded.push(endpoint);
        } else {
            included.push(endpoint);
            if (shouldPrioritize(url, config)) {
                prioritized.push(endpoint);
            }
        }
    }

    return { included, excluded, prioritized };
}

/**
 * Get authentication configuration for Playwright
 * 
 * @param {Object} config - Configuration object
 * @returns {Object|null} - Auth config or null
 */
export function getAuthConfig(config) {
    return config.authentication || null;
}
