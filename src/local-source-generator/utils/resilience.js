/**
 * Resilience Utilities for Local Source Generator
 * 
 * Provides error handling, retry logic, timeouts, and graceful degradation.
 */

/**
 * Execute a function with retry logic and exponential backoff
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 * @param {Function} options.onRetry - Callback on retry (receives error, attempt)
 * @returns {Promise<any>} - Result of fn
 */
export async function withRetry(fn, options = {}) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        shouldRetry = () => true,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries || !shouldRetry(error)) {
                throw error;
            }

            const delay = baseDelay * Math.pow(2, attempt - 1);

            if (onRetry) {
                onRetry(error, attempt, delay);
            }

            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Execute a function with a timeout
 * 
 * @param {Function} fn - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @param {string} operationName - Name for error messages
 * @returns {Promise<any>} - Result of fn
 * @throws {Error} - TimeoutError if fn doesn't complete in time
 */
export async function withTimeout(fn, timeoutMs = 30000, operationName = 'Operation') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => {
            setTimeout(() => {
                const error = new Error(`${operationName} timed out after ${timeoutMs}ms`);
                error.code = 'ETIMEDOUT';
                error.isTimeout = true;
                reject(error);
            }, timeoutMs);
        })
    ]);
}

/**
 * Execute a function with graceful fallback on error
 * 
 * @param {Function} fn - Async function to execute
 * @param {any} fallbackValue - Value to return on error
 * @param {Object} options - Options
 * @param {boolean} options.logError - Whether to log errors (default: true)
 * @param {string} options.operationName - Name for logging
 * @returns {Promise<any>} - Result of fn or fallbackValue
 */
export async function withFallback(fn, fallbackValue, options = {}) {
    const { logError = true, operationName = 'Operation' } = options;

    try {
        return await fn();
    } catch (error) {
        if (logError) {
            console.warn(`⚠️  ${operationName} failed: ${error.message}. Using fallback.`);
        }
        return fallbackValue;
    }
}

/**
 * Validate a URL string
 * 
 * @param {string} urlString - URL to validate
 * @returns {URL} - Parsed URL object
 * @throws {Error} - If URL is invalid
 */
export function validateUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        throw new Error('URL is required and must be a string');
    }

    // Trim whitespace
    const trimmed = urlString.trim();

    // Check for protocol
    if (!trimmed.match(/^https?:\/\//i)) {
        throw new Error(`Invalid URL: must start with http:// or https:// (got: ${trimmed})`);
    }

    try {
        const url = new URL(trimmed);

        // Validate hostname
        if (!url.hostname || url.hostname.length === 0) {
            throw new Error('URL must have a valid hostname');
        }

        // Disallow localhost and private IPs for safety (unless explicitly allowed)
        const hostname = url.hostname.toLowerCase();
        if (isPrivateHost(hostname) && !process.env.LSG_ALLOW_PRIVATE) {
            throw new Error(`Private/local targets require LSG_ALLOW_PRIVATE=1 (got: ${hostname})`);
        }

        return url;
    } catch (error) {
        if (error.code === 'ERR_INVALID_URL') {
            throw new Error(`Invalid URL format: ${trimmed}`);
        }
        throw error;
    }
}

/**
 * Check if a hostname is private/local
 */
function isPrivateHost(hostname) {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        hostname.match(/^10\./) ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
        hostname.match(/^192\.168\./)
    );
}

/**
 * Check if an external tool is available
 * 
 * @param {string} toolName - Name of the tool (e.g., 'nmap', 'subfinder')
 * @returns {Promise<boolean>} - True if tool is available
 */
export async function isToolAvailable(toolName) {
    try {
        const { which } = await import('zx');
        const result = await which(toolName);
        return !!result;
    } catch {
        return false;
    }
}

/**
 * Get availability status of all required tools
 * 
 * @param {string[]} tools - Array of tool names
 * @returns {Promise<Object>} - Map of tool name to availability
 */
export async function checkToolsAvailability(tools) {
    const results = {};

    for (const tool of tools) {
        results[tool] = await isToolAvailable(tool);
    }

    return results;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, timeouts)
 */
export function isRetryableError(error) {
    const retryableCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'EPIPE',
        'EHOSTUNREACH'
    ];

    return (
        retryableCodes.includes(error.code) ||
        error.isTimeout ||
        error.message?.includes('socket hang up') ||
        error.message?.includes('network')
    );
}

export { sleep };
