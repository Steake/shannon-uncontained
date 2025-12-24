/**
 * Logger utility for Shannon
 * 
 * Controls verbosity levels based on global settings:
 * - QUIET: Only errors and essential status updates
 * - NORMAL: Standard progress information  
 * - VERBOSE: Full debug output including LLM turns, tool calls, etc.
 */

import chalk from 'chalk';

// Verbosity levels
export const LOG_LEVEL = {
    QUIET: 0,   // Errors only
    NORMAL: 1,  // Standard output
    VERBOSE: 2, // Debug/detailed output
    DEBUG: 3    // Everything
};

/**
 * Get current log level from global settings
 */
function getLogLevel() {
    if (global.SHANNON_QUIET) return LOG_LEVEL.QUIET;
    if (global.SHANNON_DEBUG) return LOG_LEVEL.DEBUG;
    if (global.SHANNON_VERBOSE) return LOG_LEVEL.VERBOSE;
    return LOG_LEVEL.NORMAL;
}

/**
 * Log at specific level
 */
export function log(level, ...args) {
    if (getLogLevel() >= level) {
        console.log(...args);
    }
}

/**
 * Always log (errors, critical info)
 */
export function logAlways(...args) {
    console.log(...args);
}

/**
 * Log only in normal mode or above
 */
export function logNormal(...args) {
    log(LOG_LEVEL.NORMAL, ...args);
}

/**
 * Log only in verbose mode or above
 */
export function logVerbose(...args) {
    log(LOG_LEVEL.VERBOSE, ...args);
}

/**
 * Log only in debug mode
 */
export function logDebug(...args) {
    log(LOG_LEVEL.DEBUG, ...args);
}

/**
 * Log section header (always visible unless quiet)
 */
export function logSection(title) {
    if (getLogLevel() >= LOG_LEVEL.NORMAL) {
        console.log(chalk.cyan.bold(`\n${title}`));
        console.log(chalk.gray('─'.repeat(60)));
    }
}

/**
 * Log success message (always visible unless quiet)
 */
export function logSuccess(...args) {
    if (getLogLevel() >= LOG_LEVEL.NORMAL) {
        console.log(chalk.green(...args));
    }
}

/**
 * Log warning (always visible)
 */
export function logWarning(...args) {
    console.log(chalk.yellow(...args));
}

/**
 * Log error (always visible)
 */
export function logError(...args) {
    console.log(chalk.red(...args));
}

/**
 * Log LLM-related output (only in verbose/debug mode)
 */
export function logLLM(...args) {
    log(LOG_LEVEL.VERBOSE, chalk.blue(...args));
}

/**
 * Log tool calls (only in verbose/debug mode)
 */
export function logTool(...args) {
    log(LOG_LEVEL.VERBOSE, chalk.yellow(...args));
}

/**
 * Check if we should show verbose LLM output
 */
export function isVerbose() {
    return getLogLevel() >= LOG_LEVEL.VERBOSE;
}

/**
 * Check if we're in quiet mode
 */
export function isQuiet() {
    return getLogLevel() <= LOG_LEVEL.QUIET;
}
