/**
 * Tool Runner - Execute external tools and capture output
 * 
 * Handles:
 * - Tool availability checking
 * - Timeout management
 * - Output capture
 * - Error handling
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Tool execution result
 */
export class ToolResult {
    constructor({
        tool,
        success,
        stdout = '',
        stderr = '',
        exitCode = 0,
        duration = 0,
        timedOut = false,
        error = null,
    }) {
        this.tool = tool;
        this.success = success;
        this.stdout = stdout;
        this.stderr = stderr;
        this.exitCode = exitCode;
        this.duration = duration;
        this.timedOut = timedOut;
        this.error = error;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Check if a tool is available
 * @param {string} toolName - Tool to check
 * @returns {Promise<boolean>} Whether tool is available
 */
export async function isToolAvailable(toolName) {
    try {
        await execAsync(`which ${toolName}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Run an external tool
 * @param {string} command - Command to run
 * @param {object} options - Execution options
 * @returns {Promise<ToolResult>} Execution result
 */
export async function runTool(command, options = {}) {
    const {
        timeout = 60000,
        cwd = process.cwd(),
        env = {},
    } = options;

    const toolName = command.split(' ')[0];
    const startTime = Date.now();

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd,
            env: { ...process.env, ...env },
            timeout,
            maxBuffer: 1024 * 1024 * 20 // 20MB buffer
        });

        return new ToolResult({
            tool: toolName,
            success: true,
            stdout,
            stderr,
            duration: Date.now() - startTime,
        });
    } catch (err) {
        return new ToolResult({
            tool: toolName,
            success: false,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message,
            exitCode: err.code || 1,
            duration: Date.now() - startTime,
            timedOut: err.signal === 'SIGTERM',
            error: err.message,
        });
    }
}

/**
 * Run tool with retry logic
 * @param {string} command - Command to run
 * @param {object} options - Execution options
 * @returns {Promise<ToolResult>} Execution result
 */
export async function runToolWithRetry(command, options = {}) {
    const { maxRetries = 2, retryDelay = 1000, ...runOptions } = options;

    let lastResult;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        lastResult = await runTool(command, runOptions);

        if (lastResult.success) {
            return lastResult;
        }

        // Don't retry on timeout
        if (lastResult.timedOut) {
            return lastResult;
        }

        // Wait before retry
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, retryDelay));
        }
    }

    return lastResult;
}

/**
 * Tool timeouts (ms)
 */
export const TOOL_TIMEOUTS = {
    nmap: 120000,
    subfinder: 60000,
    whatweb: 30000,
    gau: 60000,
    katana: 90000,
    httpx: 30000,
    nuclei: 180000,
};

/**
 * Get timeout for a tool
 * @param {string} toolName - Tool name
 * @returns {number} Timeout in ms
 */
export function getToolTimeout(toolName) {
    return TOOL_TIMEOUTS[toolName] || 60000;
}

export default { runTool, runToolWithRetry, isToolAvailable, ToolResult };
