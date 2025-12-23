import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Model Limits Registry
 * Dynamically detects and caches model context limits from API error responses.
 * Persists to .shannon-model-limits.json for future runs.
 */
const MODEL_LIMITS_FILE = path.join(process.cwd(), '.shannon-model-limits.json');

// In-memory cache of model limits
let modelLimitsCache = {};

/**
 * Load model limits from persistent storage
 */
async function loadModelLimits() {
    try {
        const data = await fs.readFile(MODEL_LIMITS_FILE, 'utf8');
        modelLimitsCache = JSON.parse(data);
        console.log(`📊 Loaded ${Object.keys(modelLimitsCache).length} known model limits`);
    } catch {
        // File doesn't exist yet, start with empty cache
        modelLimitsCache = {};
    }
    return modelLimitsCache;
}

/**
 * Save model limits to persistent storage
 */
async function saveModelLimits() {
    try {
        await fs.writeFile(MODEL_LIMITS_FILE, JSON.stringify(modelLimitsCache, null, 2));
    } catch (err) {
        console.warn(`⚠️ Failed to save model limits: ${err.message}`);
    }
}

/**
 * Parse context limit from API error message
 * Example: "This endpoint's maximum context length is 262144 tokens."
 */
function parseContextLimitFromError(errorMessage) {
    // Pattern: "maximum context length is X tokens"
    const match = errorMessage.match(/maximum context length is (\d+) tokens/i);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

/**
 * Record a discovered model limit
 */
async function recordModelLimit(modelName, limit) {
    const existingLimit = modelLimitsCache[modelName];
    if (existingLimit !== limit) {
        modelLimitsCache[modelName] = limit;
        console.log(`📊 Discovered model limit: ${modelName} → ${limit.toLocaleString()} tokens`);
        await saveModelLimits();
    }
}

/**
 * Get known limit for a model (if any)
 */
export function getModelLimit(modelName) {
    return modelLimitsCache[modelName] || null;
}

/**
 * Get all known model limits
 */
export function getAllModelLimits() {
    return { ...modelLimitsCache };
}

// Load limits on module initialization
loadModelLimits().catch(() => { });

/**
 * Detect garbled/corrupted output from model
 * Returns { isGarbled: boolean, reason: string | null }
 */
export function detectGarbledOutput(content) {
    if (!content || typeof content !== 'string') {
        return { isGarbled: false, reason: null };
    }

    // Check for unexpected CJK characters (Chinese/Japanese/Korean) when not expected
    // Pattern: significant amount of CJK in otherwise English text
    const cjkChars = content.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
    const latinChars = content.match(/[a-zA-Z]/g) || [];

    if (cjkChars.length > 10 && latinChars.length > 50) {
        const cjkRatio = cjkChars.length / (latinChars.length + cjkChars.length);
        if (cjkRatio > 0.05 && cjkRatio < 0.5) {
            // Suspiciously mixed - likely encoding corruption
            return {
                isGarbled: true,
                reason: `Unexpected CJK characters (${cjkChars.length} chars, ${(cjkRatio * 100).toFixed(1)}% of text)`
            };
        }
    }

    // Check for repeated character sequences (sign of model loop/corruption)
    // Pattern: same 5+ character sequence repeated 3+ times consecutively
    const repeatedPattern = /(.{5,})\1{2,}/;
    const match = content.match(repeatedPattern);
    if (match && match[1].length > 4) {
        return {
            isGarbled: true,
            reason: `Repeated sequence detected: "${match[1].slice(0, 20)}..." (${match[0].length} chars)`
        };
    }

    // Check for excessive whitespace/newlines (sign of malformed output)
    const excessiveNewlines = /\n{10,}/.test(content);
    if (excessiveNewlines) {
        return { isGarbled: true, reason: 'Excessive consecutive newlines' };
    }

    return { isGarbled: false, reason: null };
}

/**
 * Detect and parse malformed tool calls from model output
 * Some models output XML-style <tool_call> tags instead of proper function calls
 * Returns array of parsed tool calls or empty array if none found
 */
export function parseMalformedToolCalls(content) {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const toolCalls = [];

    // Pattern 1: XML-style <tool_call><function=NAME><parameter=KEY>VALUE</parameter>...</function></tool_call>
    const xmlStylePattern = /<tool_call>\s*<function=(\w+)>([\s\S]*?)<\/function>\s*<\/tool_call>/gi;
    let match;

    while ((match = xmlStylePattern.exec(content)) !== null) {
        const functionName = match[1];
        const paramsBlock = match[2];
        const args = {};

        // Extract parameters
        const paramPattern = /<parameter=(\w+)>([\s\S]*?)<\/parameter>/gi;
        let paramMatch;
        while ((paramMatch = paramPattern.exec(paramsBlock)) !== null) {
            args[paramMatch[1]] = paramMatch[2].trim();
        }

        toolCalls.push({
            id: `malformed_${Date.now()}_${toolCalls.length}`,
            type: 'function',
            function: {
                name: functionName,
                arguments: JSON.stringify(args)
            }
        });
    }

    // Pattern 2: Markdown-style ```tool_call or similar
    const markdownPattern = /```(?:tool_call|function)\s*(\w+)\s*\n([\s\S]*?)```/gi;
    while ((match = markdownPattern.exec(content)) !== null) {
        try {
            const functionName = match[1];
            const argsText = match[2].trim();
            // Try to parse as JSON first
            let args;
            try {
                args = JSON.parse(argsText);
            } catch {
                // Try to parse key=value pairs
                args = {};
                argsText.split('\n').forEach(line => {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        args[key.trim()] = valueParts.join('=').trim();
                    }
                });
            }

            toolCalls.push({
                id: `malformed_md_${Date.now()}_${toolCalls.length}`,
                type: 'function',
                function: {
                    name: functionName,
                    arguments: JSON.stringify(args)
                }
            });
        } catch (e) {
            // Skip unparseable blocks
        }
    }

    if (toolCalls.length > 0) {
        console.warn(`⚠️ Detected ${toolCalls.length} malformed tool call(s) in text output - parsing and executing`);
    }

    return toolCalls;
}

/**
 * Estimate token count from text (approximation: ~3.5 chars per token for English)
 * Note: This is slightly conservative to account for edge cases
 */
export function estimateTokens(text) {
    if (!text) return 0;
    // Use 3.5 chars/token (more accurate than 4) + 5% overhead for JSON encoding
    return Math.ceil((text.length / 3.5) * 1.05);
}

// Estimated token overhead for tool definitions sent with each request
const TOOL_TOKEN_OVERHEAD = 4000;

/**
 * Compress context to fit within model's token limit
 * Uses "middle-out" compression: keep start/end, summarize middle
 */
export function compressContext(messages, maxTokens) {
    if (!maxTokens || maxTokens <= 0) {
        return messages; // No limit, return as-is
    }

    // Calculate current token estimate
    const totalTokens = messages.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return sum + estimateTokens(content);
    }, 0);

    if (totalTokens <= maxTokens) {
        return messages; // Already within limit
    }

    console.log(`📊 Context compression: ${totalTokens.toLocaleString()} tokens → ${maxTokens.toLocaleString()} limit`);

    // Keep system message and last few messages, truncate middle
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Reserve tokens for system + buffer + tool overhead
    const systemTokens = systemMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const availableTokens = maxTokens - systemTokens - TOOL_TOKEN_OVERHEAD - 2000; // 2000 token safety buffer

    if (availableTokens <= 0) {
        console.warn('⚠️ System messages alone exceed token limit');
        return messages.slice(0, 2); // Return minimum viable context
    }

    // Keep most recent messages that fit
    const keptMessages = [];
    let keptTokens = 0;

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
        const msg = nonSystemMessages[i];
        const msgTokens = estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));

        if (keptTokens + msgTokens <= availableTokens) {
            keptMessages.unshift(msg);
            keptTokens += msgTokens;
        } else {
            break;
        }
    }

    console.log(`📊 Kept ${keptMessages.length}/${nonSystemMessages.length} messages (${keptTokens.toLocaleString()} tokens)`);

    return [...systemMessages, ...keptMessages];
}



/**
 * Detect and configure LLM provider based on environment variables
 * 
 * Priority:
 * 1. LLM_PROVIDER + LLM_BASE_URL (fully custom endpoint)
 * 2. LLM_PROVIDER explicit selection
 * 3. Auto-detect from available API keys
 * 
 * Supported providers:
 * - github: GitHub Models (https://models.github.ai/inference)
 * - openai: OpenAI API (https://api.openai.com/v1)
 * - ollama: Local Ollama (http://localhost:11434/v1)
 * - llamacpp: Local llama.cpp server (http://localhost:8080/v1)
 * - custom: Any OpenAI-compatible endpoint (requires LLM_BASE_URL)
 */
export function getProviderConfig() {
    const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();
    const customBaseURL = process.env.LLM_BASE_URL;
    const githubToken = process.env.GITHUB_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const modelOverride = process.env.LLM_MODEL;

    // For local providers that don't need real API keys
    const dummyKey = 'not-needed';

    // Explicit provider selection
    if (explicitProvider) {
        switch (explicitProvider) {
            case 'github':
                if (!githubToken) throw new Error('LLM_PROVIDER=github but GITHUB_TOKEN not set');
                return {
                    provider: 'github',
                    baseURL: customBaseURL || 'https://models.github.ai/inference',
                    apiKey: githubToken,
                    model: modelOverride || 'openai/gpt-4.1'
                };

            case 'openai':
                if (!openaiKey) throw new Error('LLM_PROVIDER=openai but OPENAI_API_KEY not set');
                return {
                    provider: 'openai',
                    baseURL: customBaseURL || 'https://api.openai.com/v1',
                    apiKey: openaiKey,
                    model: modelOverride || 'gpt-4o'
                };

            case 'openrouter':
                if (!openrouterKey) throw new Error('LLM_PROVIDER=openrouter but OPENROUTER_API_KEY not set');
                return {
                    provider: 'openrouter',
                    baseURL: customBaseURL || 'https://openrouter.ai/api/v1',
                    apiKey: openrouterKey,
                    model: modelOverride || 'openai/gpt-4o-2024-08-06',
                    defaultHeaders: {
                        'HTTP-Referer': 'https://keygraph.dev', // Required by OpenRouter for widely used apps
                        'X-Title': 'Shannon Agent'
                    }
                };

            case 'ollama':
                // Ollama exposes OpenAI-compatible API at /v1
                // See: https://ollama.ai/blog/openai-compatibility
                return {
                    provider: 'ollama',
                    baseURL: customBaseURL || 'http://localhost:11434/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'llama3.2'
                };

            case 'llamacpp':
            case 'llama.cpp':
            case 'llama-cpp':
                // llama-cpp-python server exposes OpenAI-compatible API
                // See: https://github.com/abetlen/llama-cpp-python#openai-compatible-web-server
                return {
                    provider: 'llamacpp',
                    baseURL: customBaseURL || 'http://localhost:8080/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'local-model'
                };

            case 'lmstudio':
                // LM Studio exposes OpenAI-compatible API
                return {
                    provider: 'lmstudio',
                    baseURL: customBaseURL || 'http://localhost:1234/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'local-model'
                };

            case 'custom':
                // Fully custom endpoint - requires LLM_BASE_URL
                if (!customBaseURL) {
                    throw new Error('LLM_PROVIDER=custom requires LLM_BASE_URL to be set');
                }
                return {
                    provider: 'custom',
                    baseURL: customBaseURL,
                    apiKey: openaiKey || githubToken || openrouterKey || dummyKey,
                    model: modelOverride || 'default'
                };

            case 'anthropic':
                if (!anthropicKey) throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY not set');
                throw new Error('Anthropic provider requires @anthropic-ai/sdk - use Claude Code or set LLM_PROVIDER=github/openai/ollama/openrouter');

            default:
                throw new Error(`Unknown LLM_PROVIDER: ${explicitProvider}. Supported: github, openai, openrouter, ollama, llamacpp, lmstudio, custom`);
        }
    }

    // Auto-detect based on available keys (priority order)
    if (githubToken) {
        console.log('🤖 Auto-detected provider: GitHub Models');
        return {
            provider: 'github',
            baseURL: customBaseURL || 'https://models.github.ai/inference',
            apiKey: githubToken,
            model: modelOverride || 'openai/gpt-4.1'
        };
    }

    if (openaiKey) {
        console.log('🤖 Auto-detected provider: OpenAI');
        return {
            provider: 'openai',
            baseURL: customBaseURL || 'https://api.openai.com/v1',
            apiKey: openaiKey,
            model: modelOverride || 'gpt-4o'
        };
    }

    if (openrouterKey) {
        console.log('🤖 Auto-detected provider: OpenRouter');
        return {
            provider: 'openrouter',
            baseURL: customBaseURL || 'https://openrouter.ai/api/v1',
            apiKey: openrouterKey,
            model: modelOverride || 'openai/gpt-4o-2024-08-06',
            defaultHeaders: {
                'HTTP-Referer': 'https://keygraph.dev',
                'X-Title': 'Shannon Agent'
            }
        };
    }

    if (anthropicKey) {
        throw new Error('Anthropic API key found but Anthropic provider requires @anthropic-ai/sdk. Set GITHUB_TOKEN, OPENAI_API_KEY, or OPENROUTER_API_KEY instead.');
    }

    throw new Error(`No LLM provider configured. Set one of:
  - GITHUB_TOKEN (for GitHub Models)
  - OPENAI_API_KEY (for OpenAI)
  - OPENROUTER_API_KEY (for OpenRouter)
  - LLM_PROVIDER=ollama (for local Ollama)
  - LLM_PROVIDER=llamacpp (for local llama.cpp)
  - LLM_PROVIDER=custom + LLM_BASE_URL (for any OpenAI-compatible endpoint)`);
}

/**
 * Multi-Provider LLM Client (OpenAI SDK compatible)
 * Supports: GitHub Models, OpenAI, (Anthropic via compatibility layer)
 */
export async function* query({ prompt, options }) {
    const config = getProviderConfig();
    console.log(`🤖 Using ${config.provider} with model: ${config.model}`);

    const client = new OpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        defaultHeaders: config.defaultHeaders
    });

    const modelName = config.model;

    // 1. Initialize Tools List with Native Filesystem Tools (Replicating "Computer Use" basics)
    const tools = [
        {
            type: "function",
            function: {
                name: "run_command",
                description: "Execute a shell command in the current working directory",
                parameters: {
                    type: "object",
                    properties: {
                        command: { type: "string", description: "The command to run" }
                    },
                    required: ["command"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "read_file",
                description: "Read a file from the filesystem",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Path to the file" }
                    },
                    required: ["path"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "write_file",
                description: "Write content to a file",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Path to the file" },
                        content: { type: "string", description: "Content to write" }
                    },
                    required: ["path", "content"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "list_files",
                description: "List files in a directory",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Directory path" }
                    },
                    required: ["path"]
                }
            }
        }
    ];

    // 2. Add Internal Shannon Helper Tools
    // Hardcoding schemas to avoid Anthropic SDK structure issues

    // save_deliverable
    tools.push({
        type: "function",
        function: {
            name: "save_deliverable",
            description: "Saves deliverable files with automatic validation. Queue files must have {\"vulnerabilities\": [...]} structure.",
            parameters: {
                type: "object",
                properties: {
                    deliverable_type: {
                        type: "string",
                        description: "Type of deliverable to save",
                        enum: [
                            "CODE_ANALYSIS", "RECON", "INJECTION_ANALYSIS", "INJECTION_QUEUE",
                            "XSS_ANALYSIS", "XSS_QUEUE", "AUTH_ANALYSIS", "AUTH_QUEUE",
                            "AUTHZ_ANALYSIS", "AUTHZ_QUEUE", "SSRF_ANALYSIS", "SSRF_QUEUE",
                            "INJECTION_EVIDENCE", "XSS_EVIDENCE", "AUTH_EVIDENCE",
                            "AUTHZ_EVIDENCE", "SSRF_EVIDENCE"
                        ]
                    },
                    content: {
                        type: "string",
                        description: "File content (markdown for analysis/evidence, JSON for queues)"
                    }
                },
                required: ["deliverable_type", "content"]
            }
        }
    });

    // generate_totp
    tools.push({
        type: "function",
        function: {
            name: "generate_totp",
            description: "Generates 6-digit TOTP code for authentication. Secret must be base32-encoded.",
            parameters: {
                type: "object",
                properties: {
                    secret: {
                        type: "string",
                        description: "Base32-encoded TOTP secret",
                        pattern: "^[A-Z2-7]+$"
                    }
                },
                required: ["secret"]
            }
        }
    });


    // 3. Connect to External MCP Servers (e.g. Playwright)
    const mcpClients = [];

    if (options.mcpServers) {
        for (const [name, config] of Object.entries(options.mcpServers)) {
            if (config.type === 'stdio') {
                try {
                    const transport = new StdioClientTransport({
                        command: config.command,
                        args: config.args,
                        env: config.env
                    });

                    const mcpClient = new Client({
                        name: "shannon-client",
                        version: "1.0.0"
                    }, {
                        capabilities: {}
                    });

                    await mcpClient.connect(transport);
                    mcpClients.push({ name, client: mcpClient, transport });

                    // Fetch tools
                    const result = await mcpClient.listTools();
                    for (const tool of result.tools) {
                        tools.push({
                            type: "function",
                            function: {
                                name: tool.name, // Note: Conflicts possible if names collide
                                description: tool.description,
                                parameters: tool.inputSchema // MCP uses 'inputSchema' which maps to JSON schema
                            }
                        });
                    }

                } catch (err) {
                    console.error(`Failed to connect to MCP server ${name}:`, err);
                }
            }
        }
    }

    // --- Agent Loop ---

    let messages = [
        { role: "system", content: "You are a helpful assistant. You have access to tools. Current working directory: " + options.cwd },
        { role: "user", content: prompt }
    ];

    yield {
        type: "system",
        subtype: "init",
        model: modelName,
        permissionMode: options.permissionMode,
        mcp_servers: mcpClients.map(c => ({ name: c.name, status: 'connected' }))
    };

    let keepGoing = true;
    let turn = 0;
    const maxTurns = options.maxTurns || 200; // Increase turn limit
    let totalCost = 0;
    const startTime = Date.now(); // Track start time for duration calculation

    // Non-retryable error codes (billing, auth, client errors, payload too large)
    const NON_RETRYABLE_STATUS_CODES = [400, 401, 402, 403, 404, 413];
    const isNonRetryableError = (error) => {
        if (error.status && NON_RETRYABLE_STATUS_CODES.includes(error.status)) {
            return true;
        }
        return false;
    };

    try {
        while (keepGoing && turn < maxTurns) {
            turn++;

            // Apply context compression if we know the model's limit
            const modelLimit = getModelLimit(modelName);
            let messagesToSend = messages;

            // Proactive compression: estimate tokens and compress if potentially over limit
            const estimatedTotal = messages.reduce((sum, m) => {
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
                return sum + estimateTokens(content);
            }, 0);

            if (modelLimit) {
                // Use known limit - trigger at 80% to leave room for tool overhead
                if (estimatedTotal > modelLimit * 0.8) {
                    console.log(`📊 Proactive compression: ${estimatedTotal.toLocaleString()} estimated tokens exceeds 80% of ${modelLimit.toLocaleString()} limit`);
                    messagesToSend = compressContext(messages, Math.floor(modelLimit * 0.75)); // Target 75% to leave headroom
                }
            } else if (estimatedTotal > 128000) {
                // Default safety limit for unknown models (conservative 128k)
                console.log(`📊 Proactive compression: ${estimatedTotal.toLocaleString()} estimated tokens exceeds 128k safety threshold`);
                messagesToSend = compressContext(messages, 128000);
            }

            const response = await client.chat.completions.create({
                messages: messagesToSend,
                model: modelName,
                tools: tools,
                tool_choice: "auto"
            });

            const choice = response.choices[0];
            const message = choice.message;

            // Check for garbled output
            if (message.content) {
                const garbledCheck = detectGarbledOutput(message.content);
                if (garbledCheck.isGarbled) {
                    console.warn(`⚠️ Garbled output detected: ${garbledCheck.reason}`);
                    // Continue anyway but log the issue - let validation handle retry
                }
            }

            messages.push(message);

            if (message.content) {
                yield {
                    type: "assistant",
                    message: { content: message.content }
                };
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                for (const toolCall of message.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    yield {
                        type: "tool_use",
                        name: functionName,
                        input: functionArgs
                    };

                    let result = "";
                    let isError = false;

                    try {
                        // Route to correct handler
                        // 1. Native Tools
                        if (functionName === "run_command") {
                            const cmd = functionArgs.command;
                            // Use child_process.exec for proper shell interpretation
                            // This enables redirection (>>, >), pipes (|), and quoted args
                            try {
                                const { stdout, stderr } = await execAsync(cmd, {
                                    cwd: options.cwd,
                                    maxBuffer: 1024 * 1024 * 20, // 20MB buffer
                                    timeout: 120000 // 2 minute timeout
                                });
                                result = stdout + (stderr ? "\nStderr: " + stderr : "");
                            } catch (execError) {
                                result = (execError.stdout || '') + "\nStderr: " + (execError.stderr || execError.message);
                                isError = true;
                            }

                        } else if (functionName === "read_file") {
                            const filePath = path.resolve(options.cwd, functionArgs.path);
                            result = await fs.readFile(filePath, 'utf8');

                        } else if (functionName === "write_file") {
                            const filePath = path.resolve(options.cwd, functionArgs.path);
                            await fs.writeFile(filePath, functionArgs.content);
                            result = "File written successfully";

                        } else if (functionName === "list_files") {
                            const searchPath = path.resolve(options.cwd, functionArgs.path);
                            const files = await fs.readdir(searchPath);
                            result = files.join('\n');
                        }
                        // 2. Internal Tools (Shannon Helper)
                        else if (functionName === "save_deliverable") {
                            // Map deliverable_type to filename (Hardcoded mapping from mcp-server/src/types/deliverables.js)
                            const DELIVERABLE_FILENAMES = {
                                'CODE_ANALYSIS': 'code_analysis_deliverable.md',
                                'RECON': 'recon_deliverable.md',
                                'INJECTION_ANALYSIS': 'injection_analysis_deliverable.md',
                                'INJECTION_QUEUE': 'injection_exploitation_queue.json',
                                'XSS_ANALYSIS': 'xss_analysis_deliverable.md',
                                'XSS_QUEUE': 'xss_exploitation_queue.json',
                                'AUTH_ANALYSIS': 'auth_analysis_deliverable.md',
                                'AUTH_QUEUE': 'auth_exploitation_queue.json',
                                'AUTHZ_ANALYSIS': 'authz_analysis_deliverable.md',
                                'AUTHZ_QUEUE': 'authz_exploitation_queue.json',
                                'SSRF_ANALYSIS': 'ssrf_analysis_deliverable.md',
                                'SSRF_QUEUE': 'ssrf_exploitation_queue.json',
                                'INJECTION_EVIDENCE': 'injection_exploitation_evidence.md',
                                'XSS_EVIDENCE': 'xss_exploitation_evidence.md',
                                'AUTH_EVIDENCE': 'auth_exploitation_evidence.md',
                                'AUTHZ_EVIDENCE': 'authz_exploitation_evidence.md',
                                'SSRF_EVIDENCE': 'ssrf_exploitation_evidence.md',
                            };

                            const { deliverable_type, content } = functionArgs;
                            const filename = DELIVERABLE_FILENAMES[deliverable_type];

                            if (!filename) {
                                throw new Error(`Unknown deliverable_type: ${deliverable_type}`);
                            }

                            const targetDir = options.cwd; // Using CWD as target
                            const filePath = path.join(targetDir, 'deliverables', filename);

                            await fs.mkdir(path.dirname(filePath), { recursive: true });
                            await fs.writeFile(filePath, content);

                            // Return JSON string matching original tool behavior
                            result = JSON.stringify({
                                status: 'success',
                                message: `Deliverable saved successfully: ${filename}`,
                                filepath: filePath,
                                deliverableType: deliverable_type,
                                validated: false // Skipping deep validation logic here to avoid deps
                            });
                        } else if (functionName === "generate_totp") {
                            // Implement TOTP generation if needed using 'totp-generator' or similar
                            result = "TOTP generation not supported in this client version";
                        }
                        // 3. External MCP Tools (Playwright)
                        else {
                            // Find client that provides this tool
                            // Simple linear search or map - for now iterate all
                            let handled = false;
                            for (const mcp of mcpClients) {
                                // Ideally we cached which tool belongs to which client
                                try {
                                    // Optimistic call
                                    const mcpResult = await mcp.client.callTool({
                                        name: functionName,
                                        arguments: functionArgs
                                    });
                                    // mcpResult structure: { content: [ { type: 'text', text: '...' } ], isError: boolean }
                                    const textContent = mcpResult.content.find(c => c.type === 'text')?.text || JSON.stringify(mcpResult.content);
                                    result = textContent;
                                    isError = mcpResult.isError;
                                    handled = true;
                                    break;
                                } catch (e) {
                                    // Not this client or call failed
                                    // If error is "Method not found", continue
                                    if (!e.message.includes("Method not found") && !e.message.includes("Tool not found")) {
                                        throw e; // Real error
                                    }
                                }
                            }
                            if (!handled) {
                                result = `Unknown tool: ${functionName}`;
                                isError = true;
                            }
                        }

                    } catch (err) {
                        result = `Error executing ${functionName}: ${err.message}`;
                        isError = true;
                    }

                    yield {
                        type: "tool_result",
                        content: result,
                        isError: isError
                    };

                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: functionName,
                        content: result
                    });
                }
            } else {
                // Check for malformed tool calls in the text output before terminating
                const malformedCalls = parseMalformedToolCalls(message.content);

                if (malformedCalls.length > 0) {
                    // Process malformed tool calls as if they were proper tool calls
                    for (const toolCall of malformedCalls) {
                        const functionName = toolCall.function.name;
                        let functionArgs;
                        try {
                            functionArgs = JSON.parse(toolCall.function.arguments);
                        } catch {
                            functionArgs = {};
                        }

                        yield {
                            type: "tool_use",
                            name: functionName,
                            input: functionArgs
                        };

                        let result;
                        let isError = false;
                        try {
                            // Execute the malformed tool call (same logic as proper tool calls)
                            if (functionName === "bash" || functionName === "run_command") {
                                const command = functionArgs.command || functionArgs.CommandLine || '';
                                const cwd = functionArgs.cwd || functionArgs.Cwd || options.cwd;
                                const { stdout, stderr } = await execAsync(command, { cwd });
                                result = stdout + (stderr ? "\nStderr: " + stderr : "");
                            } else if (functionName === "read_file") {
                                const filePath = path.resolve(options.cwd, functionArgs.path);
                                result = await fs.readFile(filePath, 'utf8');
                            } else if (functionName === "write_file") {
                                const filePath = path.resolve(options.cwd, functionArgs.path);
                                await fs.writeFile(filePath, functionArgs.content);
                                result = "File written successfully";
                            } else if (functionName === "list_files") {
                                const searchPath = path.resolve(options.cwd, functionArgs.path);
                                const files = await fs.readdir(searchPath);
                                result = files.join('\n');
                            } else {
                                result = `Unknown malformed tool: ${functionName}`;
                                isError = true;
                            }
                        } catch (err) {
                            result = `Error executing malformed ${functionName}: ${err.message}`;
                            isError = true;
                        }

                        yield {
                            type: "tool_result",
                            content: result,
                            isError: isError
                        };

                        // Add the malformed tool call to message history as if it was proper
                        messages.push({
                            role: "assistant",
                            content: null,
                            tool_calls: [toolCall]
                        });
                        messages.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: functionName,
                            content: result
                        });
                    }
                    // Continue the loop - don't terminate
                } else {
                    // No tool calls and no malformed tool calls - terminate normally
                    keepGoing = false;
                    let finalResult = message.content || "";
                    yield {
                        type: "result",
                        result: finalResult,
                        total_cost_usd: totalCost,
                        duration_ms: Date.now() - startTime,
                        subtype: "success"
                    };
                }
            }
        }
    } catch (error) {
        // Detect and record model context limits from 400 errors
        let limitDiscovered = false;
        if (error.status === 400 && error.message) {
            const detectedLimit = parseContextLimitFromError(error.message);
            if (detectedLimit) {
                await recordModelLimit(modelName, detectedLimit);
                limitDiscovered = true;
            }
        }

        // Classify error for retry logic
        // Context limit errors ARE retryable if we just discovered the limit
        const nonRetryable = isNonRetryableError(error) && !limitDiscovered;
        if (nonRetryable) {
            console.error(`🚫 Non-retryable error (${error.status}):`, error.message);
        } else if (limitDiscovered) {
            console.log(`📊 Context limit discovered (${modelLimitsCache[modelName]?.toLocaleString()} tokens). Will retry with compression.`);
        } else {
            console.error("LLM CLIENT CRASHED:", error);
        }

        yield {
            type: "result",
            result: null,
            error: error.message,
            duration_ms: Date.now() - startTime,
            nonRetryable: nonRetryable,
            errorCode: error.status || error.code,
            subtype: limitDiscovered ? "context_limit_discovered" : "error_during_execution"
        };
    } finally {
        // Cleanup with EPIPE protection
        for (const mcp of mcpClients) {
            try {
                await mcp.transport.close();
            } catch (e) {
                // Suppress EPIPE errors during cleanup (process already exiting)
                if (e.code !== 'EPIPE' && e.code !== 'ERR_STREAM_DESTROYED') {
                    console.warn(`⚠️ MCP cleanup error: ${e.message}`);
                }
            }
        }
    }
}
