/**
 * LLM-Powered Analysis Module
 * 
 * Uses LLM to infer architecture, data flows, and patterns from crawled data.
 * Prompts loaded from prompts/shared/llm-analysis.txt
 */

import { getProviderConfig } from '../../ai/llm-client.js';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load a specific section from the LLM analysis prompts file
 */
async function loadAnalysisPrompt(sectionName) {
    try {
        const promptPath = path.join(__dirname, '../../../prompts/shared/llm-analysis.txt');
        const content = await fs.readFile(promptPath, 'utf8');

        // Extract section between markers
        const startMarker = `=== ${sectionName} ===`;
        const endMarker = `=== END ${sectionName} ===`;

        const startIdx = content.indexOf(startMarker);
        const endIdx = content.indexOf(endMarker);

        if (startIdx === -1 || endIdx === -1) {
            console.warn(`Prompt section '${sectionName}' not found, using fallback`);
            return getFallbackPrompt(sectionName);
        }

        return content.substring(startIdx + startMarker.length, endIdx).trim();
    } catch (error) {
        console.warn(`Failed to load prompt: ${error.message}, using fallback`);
        return getFallbackPrompt(sectionName);
    }
}

/**
 * Fallback prompts if file loading fails
 */
function getFallbackPrompt(sectionName) {
    const fallbacks = {
        'ARCHITECTURE INFERENCE': 'You are a security researcher. Analyze the data and infer architecture. Respond with JSON.',
        'API PATTERN DETECTION': 'Analyze API endpoints and identify patterns. Respond with JSON.',
        'AUTH FLOW ANALYSIS': 'Analyze authentication flows. Respond with JSON.',
        'DATA FLOW MAPPING': 'Map data flows from endpoints. Respond with JSON.'
    };
    return fallbacks[sectionName] || 'Analyze the provided data. Respond with JSON.';
}

/**
 * LLM Analyzer for black-box reconnaissance data
 */
export class LLMAnalyzer {
    constructor(options = {}) {
        this.config = getProviderConfig();
        this.client = new OpenAI({
            baseURL: this.config.baseURL,
            apiKey: this.config.apiKey,
        });
        this.model = options.model || this.config.model;
        this.maxTokens = options.maxTokens || 4096;
        this.promptCache = {};
    }

    /**
     * Get cached or load prompt
     */
    async getPrompt(sectionName) {
        if (!this.promptCache[sectionName]) {
            this.promptCache[sectionName] = await loadAnalysisPrompt(sectionName);
        }
        return this.promptCache[sectionName];
    }

    /**
     * Infer application architecture from crawled endpoints
     */
    async inferArchitecture(reconData) {
        const systemPrompt = await this.getPrompt('ARCHITECTURE INFERENCE');
        const userPrompt = this.buildArchitecturePrompt(reconData);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: this.maxTokens,
            response_format: { type: 'json_object' }
        });

        try {
            return JSON.parse(response.choices[0].message.content);
        } catch {
            return { raw: response.choices[0].message.content, error: 'Failed to parse JSON' };
        }
    }

    /**
     * Identify API patterns from endpoints
     */
    async identifyAPIPatterns(endpoints) {
        const systemPrompt = await this.getPrompt('API PATTERN DETECTION');

        const endpointSummary = endpoints.slice(0, 100).map(ep => ({
            path: ep.path,
            method: ep.method || 'GET',
            params: ep.params?.map(p => p.name) || []
        }));

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(endpointSummary, null, 2) }
            ],
            max_tokens: this.maxTokens,
            response_format: { type: 'json_object' }
        });

        try {
            return JSON.parse(response.choices[0].message.content);
        } catch {
            return { raw: response.choices[0].message.content, error: 'Failed to parse JSON' };
        }
    }

    /**
     * Detect authentication flows from form analysis
     */
    async detectAuthFlows(forms, endpoints) {
        const systemPrompt = await this.getPrompt('AUTH FLOW ANALYSIS');

        const authRelated = endpoints.filter(ep =>
            ep.path.match(/\/(login|signin|auth|register|signup|logout|password|forgot|reset|verify|2fa|mfa|oauth)/i)
        );

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify({ forms, authEndpoints: authRelated }, null, 2) }
            ],
            max_tokens: this.maxTokens,
            response_format: { type: 'json_object' }
        });

        try {
            return JSON.parse(response.choices[0].message.content);
        } catch {
            return { raw: response.choices[0].message.content, error: 'Failed to parse JSON' };
        }
    }

    /**
     * Generate data flow model from endpoints and parameters
     */
    async generateDataFlowModel(endpoints) {
        const systemPrompt = await this.getPrompt('DATA FLOW MAPPING');

        const dataPoints = endpoints.map(ep => ({
            path: ep.path,
            method: ep.method || 'GET',
            inputs: ep.params || [],
            source: ep.source
        })).slice(0, 50);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(dataPoints, null, 2) }
            ],
            max_tokens: this.maxTokens,
            response_format: { type: 'json_object' }
        });

        try {
            return JSON.parse(response.choices[0].message.content);
        } catch {
            return { raw: response.choices[0].message.content, error: 'Failed to parse JSON' };
        }
    }

    /**
     * Build architecture inference prompt
     */
    buildArchitecturePrompt(reconData) {
        return `Analyze this black-box reconnaissance data and infer the application architecture:

## Technology Detection (whatweb)
${reconData.whatweb || 'No data'}

## Discovered Endpoints (${reconData.endpoints?.length || 0} total)
${JSON.stringify(reconData.endpoints?.slice(0, 30) || [], null, 2)}

## JavaScript Files Analyzed
${JSON.stringify(reconData.jsFiles?.slice(0, 10) || [], null, 2)}

## API Schemas Found
${JSON.stringify(reconData.apiSchemas || [], null, 2)}

Provide a JSON response with:
- framework: detected framework(s)
- architecture: MVC, microservices, monolith, etc.
- apiStyle: REST, GraphQL, SOAP, etc.
- authMechanism: session, JWT, OAuth, etc.
- database: likely database type
- components: list of inferred components
- confidence: 0-1 confidence score
- reasoning: brief explanation`;
    }
}
