/**
 * Tests for LLM Client v2
 * 
 * Run with: node --test src/local-source-generator/tests/llm-client.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach, mock } from 'node:test';

// Store original env vars
const originalEnv = { ...process.env };

// Helper to reset env vars
function resetEnv() {
    // Clear LLM-related env vars
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
}

// Helper to restore env vars
function restoreEnv() {
    Object.keys(process.env).forEach(key => {
        if (key.startsWith('LLM_') || key.includes('API_KEY')) {
            delete process.env[key];
        }
    });
    Object.assign(process.env, originalEnv);
}

describe('LLMClient', () => {
    beforeEach(() => {
        resetEnv();
    });

    afterEach(() => {
        restoreEnv();
    });

    describe('Provider-aware API key selection', () => {
        test('should use OPENROUTER_API_KEY when provider is openrouter', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
            process.env.ANTHROPIC_API_KEY = 'sk-ant-wrong-key';
            process.env.OPENAI_API_KEY = 'sk-openai-wrong-key';

            // Re-import to pick up new env vars
            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.apiKey, 'sk-or-test-key');
            assert.equal(client.options.provider, 'openrouter');
        });

        test('should use ANTHROPIC_API_KEY when provider is anthropic', async () => {
            process.env.LLM_PROVIDER = 'anthropic';
            process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
            process.env.OPENAI_API_KEY = 'sk-openai-wrong-key';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.apiKey, 'sk-ant-test-key');
            assert.equal(client.options.provider, 'anthropic');
        });

        test('should use OPENAI_API_KEY when provider is openai (default)', async () => {
            process.env.OPENAI_API_KEY = 'sk-openai-test-key';
            process.env.ANTHROPIC_API_KEY = 'sk-ant-wrong-key';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.apiKey, 'sk-openai-test-key');
            assert.equal(client.options.provider, 'openai');
        });

        test('should use LLM_API_KEY when explicitly set (overrides provider-specific)', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.LLM_API_KEY = 'sk-explicit-key';
            process.env.OPENROUTER_API_KEY = 'sk-or-wrong-key';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.apiKey, 'sk-explicit-key');
        });

        test('should fallback to any available key if provider-specific not found', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            // No OPENROUTER_API_KEY set
            process.env.ANTHROPIC_API_KEY = 'sk-ant-fallback';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            // Should fallback to anthropic key
            assert.equal(client.options.apiKey, 'sk-ant-fallback');
        });
    });

    describe('OpenRouter auto-configuration', () => {
        test('should auto-set baseUrl for openrouter provider', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.OPENROUTER_API_KEY = 'sk-or-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.baseUrl, 'https://openrouter.ai/api/v1');
        });

        test('should use LLM_BASE_URL if explicitly set', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.LLM_BASE_URL = 'https://custom.openrouter.ai/v1';
            process.env.OPENROUTER_API_KEY = 'sk-or-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.options.baseUrl, 'https://custom.openrouter.ai/v1');
        });

        test('should not auto-set baseUrl for non-openrouter providers', async () => {
            process.env.LLM_PROVIDER = 'openai';
            process.env.OPENAI_API_KEY = 'sk-openai-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            // baseUrl should be undefined (uses default in callOpenAI)
            assert.equal(client.options.baseUrl, undefined);
        });
    });

    describe('isAvailable', () => {
        test('should return true when API key is configured', async () => {
            process.env.LLM_PROVIDER = 'openai';
            process.env.OPENAI_API_KEY = 'sk-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.isAvailable(), true);
        });

        test('should return false when no API key is configured', async () => {
            // No API keys set
            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            assert.equal(client.isAvailable(), false);
        });
    });

    describe('getConfig', () => {
        test('should return provider and model info', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.LLM_MODEL = 'custom-model';
            process.env.OPENROUTER_API_KEY = 'sk-or-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();
            const config = client.getConfig();

            assert.equal(config.provider, 'openrouter');
            assert.equal(config.model, 'custom-model');
            assert.equal(config.hasApiKey, true);
        });
    });

    describe('callOpenAI headers', () => {
        test('should include OpenRouter-specific headers when baseUrl is openrouter.ai', async () => {
            process.env.LLM_PROVIDER = 'openrouter';
            process.env.OPENROUTER_API_KEY = 'sk-or-test';

            const { LLMClient } = await import('../v2/orchestrator/llm-client.js');
            const client = new LLMClient();

            // Mock global fetch
            const originalFetch = global.fetch;
            const mockFetch = mock.fn(async (url, options) => {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'LLM Response' } }],
                        usage: { total_tokens: 10 }
                    })
                };
            });
            global.fetch = mockFetch;

            try {
                await client.callOpenAI('Test prompt', { model: 'test-model' });

                const lastCall = mockFetch.mock.calls[0];
                const headers = lastCall.arguments[1].headers;

                assert.equal(headers['Authorization'], 'Bearer sk-or-test');
                assert.equal(headers['HTTP-Referer'], 'https://github.com/shannon-security');
                assert.equal(headers['X-Title'], 'Shannon Security Scanner');
            } finally {
                global.fetch = originalFetch;
            }
        });
    });
});
