/**
 * LLM Client wrapper for LSG v2
 * 
 * Provides capability-based routing and structured output enforcement.
 */

/**
 * LLM Capabilities
 */
export const LLM_CAPABILITIES = {
    CLASSIFY_FAST: 'classify_fast',
    INFER_ARCHITECTURE: 'infer_architecture_graph',
    EXTRACT_CLAIMS: 'extract_structured_claims',
    SYNTHESIZE_CODE_PATCH: 'synthesize_code_patch',
    SYNTHESIZE_MODULE: 'synthesize_full_module',
    SCHEMA_COMPLETION: 'schema_completion',
    TEST_GENERATION: 'test_generation',
};

/**
 * Default model routing by capability
 */
const DEFAULT_ROUTING = {
    [LLM_CAPABILITIES.CLASSIFY_FAST]: { tier: 'fast', preferLocal: true },
    [LLM_CAPABILITIES.INFER_ARCHITECTURE]: { tier: 'smart', preferLocal: false },
    [LLM_CAPABILITIES.EXTRACT_CLAIMS]: { tier: 'smart', preferLocal: false },
    [LLM_CAPABILITIES.SYNTHESIZE_CODE_PATCH]: { tier: 'code', preferLocal: true },
    [LLM_CAPABILITIES.SYNTHESIZE_MODULE]: { tier: 'code', preferLocal: false },
    [LLM_CAPABILITIES.SCHEMA_COMPLETION]: { tier: 'smart', preferLocal: false },
    [LLM_CAPABILITIES.TEST_GENERATION]: { tier: 'code', preferLocal: true },
};

/**
 * LLM Client for LSG v2
 */
export class LLMClient {
    constructor(options = {}) {
        const provider = process.env.LLM_PROVIDER || 'openai';

        // API key - select based on provider for correct matching
        let apiKey = process.env.LLM_API_KEY;
        if (!apiKey) {
            const providerKeys = {
                openrouter: process.env.OPENROUTER_API_KEY,
                anthropic: process.env.ANTHROPIC_API_KEY,
                openai: process.env.OPENAI_API_KEY
            };
            apiKey = providerKeys[provider] || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY;
        }

        // Base URL - auto-detect for OpenRouter
        let baseUrl = process.env.LLM_BASE_URL;
        if (!baseUrl && provider === 'openrouter') {
            baseUrl = 'https://openrouter.ai/api/v1';
        }

        this.options = {
            provider,
            baseUrl,
            apiKey,
            defaultModel: process.env.LLM_MODEL || 'gpt-4o',
            ...options,
        };

        this.routing = { ...DEFAULT_ROUTING, ...options.routing };
    }

    /**
     * Check if LLM is available (API key configured)
     * @returns {boolean} True if API key is configured
     */
    isAvailable() {
        return !!this.options.apiKey;
    }

    /**
     * Get the configured provider and model for display
     * @returns {object} { provider, model, hasApiKey }
     */
    getConfig() {
        return {
            provider: this.options.provider,
            model: this.options.defaultModel,
            hasApiKey: this.isAvailable(),
        };
    }

    /**
     * Generate completion with structured output
     * @param {string} prompt - Prompt text
     * @param {object} options - Generation options
     * @returns {Promise<object>} { success, content, tokens_used, model }
     */
    async generate(prompt, options = {}) {
        const {
            capability = LLM_CAPABILITIES.EXTRACT_CLAIMS,
            schema = null,
            maxTokens = 4096,
            temperature = 0.3,
        } = options;

        const route = this.routing[capability] || { tier: 'smart' };
        const model = options.model || this.selectModel(route);

        try {
            const response = await this.callAPI(prompt, {
                model,
                maxTokens,
                temperature,
                schema,
            });

            return {
                success: true,
                content: response.content,
                tokens_used: response.usage?.total_tokens || 0,
                model,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                model,
            };
        }
    }

    /**
     * Generate with JSON schema validation
     * @param {string} prompt - Prompt text
     * @param {object} schema - JSON schema for output
     * @param {object} options - Generation options
     * @returns {Promise<object>} Parsed JSON output
     */
    async generateStructured(prompt, schema, options = {}) {
        const systemPrompt = `You must respond with valid JSON that conforms to this schema:
${JSON.stringify(schema, null, 2)}

Respond ONLY with the JSON, no other text or markdown.`;

        const fullPrompt = `${systemPrompt}\n\n${prompt}`;

        const result = await this.generate(fullPrompt, {
            ...options,
            temperature: 0.2, // Lower temperature for structured output
        });

        if (!result.success) {
            return result;
        }

        try {
            // Extract JSON from response
            let jsonStr = result.content;

            // Handle potential markdown code blocks
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonStr.trim());

            return {
                success: true,
                data: parsed,
                tokens_used: result.tokens_used,
                model: result.model,
            };
        } catch (parseError) {
            return {
                success: false,
                error: `JSON parse error: ${parseError.message}`,
                raw_content: result.content,
                model: result.model,
            };
        }
    }

    /**
     * Select model based on routing
     * @param {object} route - Routing config
     * @returns {string} Model identifier
     */
    selectModel(route) {
        // Model tiers - configurable via env
        const tiers = {
            fast: process.env.LLM_FAST_MODEL || 'gpt-4.1',
            smart: process.env.LLM_SMART_MODEL || 'gpt-5.2',
            code: process.env.LLM_CODE_MODEL || 'claude-4.5-sonnet',
        };

        return tiers[route.tier] || this.options.defaultModel;
    }

    /**
     * Call LLM API
     * @param {string} prompt - Prompt text
     * @param {object} options - API options
     * @returns {Promise<object>} API response
     */
    async callAPI(prompt, options) {
        const { model, maxTokens, temperature } = options;

        // Determine provider from model name or config
        const isAnthropic = model.toLowerCase().includes('claude');
        const isOpenAI = !isAnthropic;

        if (isAnthropic) {
            return this.callAnthropic(prompt, { model, maxTokens, temperature });
        } else {
            return this.callOpenAI(prompt, { model, maxTokens, temperature });
        }
    }

    /**
     * Call OpenAI-compatible API (also works for OpenRouter with extra headers)
     */
    async callOpenAI(prompt, options) {
        const baseUrl = this.options.baseUrl || 'https://api.openai.com/v1';
        const isOpenRouter = baseUrl.includes('openrouter.ai');

        // Build headers - OpenRouter requires additional headers
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.options.apiKey}`,
        };

        // OpenRouter-specific headers (required for auth)
        if (isOpenRouter) {
            headers['HTTP-Referer'] = 'https://github.com/shannon-security';
            headers['X-Title'] = 'Shannon Security Scanner';
        }

        const response = await this.fetchWithRetry(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: options.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: options.maxTokens,
                temperature: options.temperature,
            }),
        });

        const data = await response.json();

        return {
            content: data.choices[0].message.content,
            usage: data.usage,
        };
    }

    /**
     * Call Anthropic API
     */
    async callAnthropic(prompt, options) {
        const baseUrl = this.options.baseUrl || 'https://api.anthropic.com/v1';

        const response = await this.fetchWithRetry(`${baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.options.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: options.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: options.maxTokens,
            }),
        });

        const data = await response.json();

        return {
            content: data.content[0].text,
            usage: {
                total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            },
        };
    }

    /**
     * Fetch with exponential backoff retry
     * @param {string} url - URL to fetch
     * @param {object} options - Fetch options
     * @param {number} retries - Max retries
     * @returns {Promise<Response>} Fetch response
     */
    async fetchWithRetry(url, options, retries = 3) {
        let lastError;
        const baseDelay = 1000;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, options);

                // Handle rate limits (429) & server errors (5xx)
                if (response.status === 429 || response.status >= 500) {
                    const retryAfter = response.headers.get('retry-after');
                    const delay = retryAfter
                        ? parseInt(retryAfter, 10) * 1000
                        : baseDelay * Math.pow(2, attempt); // Exponential backoff

                    if (attempt < retries) {
                        console.warn(`[LLM] Rate limit/Error ${response.status}. Retrying in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                }

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`LLM API error: ${response.status} - ${error}`);
                }

                return response;
            } catch (error) {
                lastError = error;
                // Don't retry client errors (4xx) except 429
                if (error.message.includes('400') || error.message.includes('401') || error.message.includes('403') || error.message.includes('404')) {
                    throw error;
                }

                if (attempt < retries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`[LLM] Connection error. Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
            }
        }

        throw lastError;
    }
}

/**
 * Singleton instance
 */
let clientInstance = null;

export function getLLMClient(options = {}) {
    if (!clientInstance) {
        clientInstance = new LLMClient(options);
    }
    return clientInstance;
}

export default LLMClient;
