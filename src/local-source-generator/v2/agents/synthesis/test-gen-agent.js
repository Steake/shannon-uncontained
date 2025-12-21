/**
 * TestGenAgent - Test generation agent
 * 
 * Generates property-based tests and vulnerability probes from
 * TargetModel and VulnHypotheses.
 */

import { BaseAgent } from '../base-agent.js';
import { getLLMClient, LLM_CAPABILITIES } from '../../orchestrator/llm-client.js';
import { CLAIM_TYPES } from '../../epistemics/ledger.js';

export class TestGenAgent extends BaseAgent {
    constructor(options = {}) {
        super('TestGenAgent', options);

        this.inputs_schema = {
            type: 'object',
            required: ['target', 'outputDir'],
            properties: {
                target: { type: 'string' },
                outputDir: { type: 'string' },
                testType: { type: 'string', enum: ['api', 'security', 'both'] },
            },
        };

        this.outputs_schema = {
            type: 'object',
            properties: {
                test_files: { type: 'array' },
                test_count: { type: 'number' },
            },
        };

        this.requires = {
            evidence_kinds: [],
            model_nodes: ['endpoint'],
        };

        this.emits = {
            evidence_events: [],
            model_updates: [],
            claims: [],
            artifacts: ['test_files'],
        };

        this.default_budget = {
            max_time_ms: 180000,
            max_network_requests: 5,
            max_tokens: 15000,
            max_tool_invocations: 10,
        };

        this.llm = getLLMClient();
    }

    async run(ctx, inputs) {
        const { target, outputDir, testType = 'both' } = inputs;
        const { fs, path } = await import('zx');

        const results = {
            test_files: [],
            test_count: 0,
            api_tests: 0,
            security_tests: 0,
        };

        await fs.mkdir(outputDir, { recursive: true });

        const endpoints = ctx.targetModel.getEndpoints();
        const vulnClaims = ctx.ledger.getClaimsByType(CLAIM_TYPES.VULNERABILITY);

        if (testType === 'api' || testType === 'both') {
            const apiTests = await this.generateAPITests(ctx, target, endpoints);
            const apiTestPath = path.join(outputDir, 'api.test.js');
            await fs.writeFile(apiTestPath, apiTests);

            results.test_files.push(apiTestPath);
            results.api_tests = this.countTests(apiTests);
            results.test_count += results.api_tests;

            ctx.manifest.addEntry({
                path: apiTestPath,
                generated_from: endpoints.map(e => e.id),
                evidence_refs: [],
            });
        }

        if (testType === 'security' || testType === 'both') {
            const securityTests = await this.generateSecurityTests(ctx, target, vulnClaims);
            const securityTestPath = path.join(outputDir, 'security.test.js');
            await fs.writeFile(securityTestPath, securityTests);

            results.test_files.push(securityTestPath);
            results.security_tests = this.countTests(securityTests);
            results.test_count += results.security_tests;

            ctx.manifest.addEntry({
                path: securityTestPath,
                generated_from: vulnClaims.map(c => c.id),
                evidence_refs: [],
            });
        }

        return results;
    }

    /**
     * Generate API endpoint tests
     */
    async generateAPITests(ctx, target, endpoints) {
        const tests = [];

        tests.push(`/**
 * API Tests - LSG v2 Generated
 * 
 * Target: ${target}
 * Endpoints: ${endpoints.length}
 */

const request = require('supertest');
const app = require('../app'); // Adjust path as needed

const BASE_URL = '${target}';

describe('API Endpoints', () => {
`);

        // Group by resource
        const byResource = this.groupByResource(endpoints);

        for (const [resource, eps] of Object.entries(byResource)) {
            tests.push(`  describe('${resource}', () => {`);

            for (const ep of eps) {
                const method = (ep.attributes.method || 'GET').toLowerCase();
                const path = ep.attributes.path || '/';
                const confidence = this.getConfidence(ctx, ep);

                tests.push(`
    // Confidence: ${confidence.toFixed(2)}
    it('should ${method.toUpperCase()} ${path}', async () => {
      const response = await request(app)
        .${method}('${path}')
        ${this.generateRequestBody(ep)}
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });`);
            }

            tests.push('  });\n');
        }

        tests.push('});');

        return tests.join('\n');
    }

    /**
     * Generate security tests from vulnerability hypotheses
     */
    async generateSecurityTests(ctx, target, vulnClaims) {
        if (vulnClaims.length === 0) {
            return `/**
 * Security Tests - LSG v2 Generated
 * 
 * No vulnerability hypotheses found.
 */

describe('Security Tests', () => {
  it.skip('No security tests generated - no vulnerability hypotheses', () => {});
});
`;
        }

        ctx.recordTokens(2000);

        // Use LLM to generate targeted security tests
        const prompt = `Generate security test cases for these vulnerability hypotheses:

${JSON.stringify(vulnClaims.slice(0, 15).map(c => ({
            endpoint: c.subject,
            type: c.predicate.vuln_type,
            name: c.predicate.name,
            severity: c.predicate.severity,
        })), null, 2)}

Generate Jest/Supertest security test code that:
1. Tests for the specific vulnerability pattern
2. Includes common payloads for each vulnerability type
3. Validates response handling
4. Checks for information disclosure

Return only valid JavaScript test code, using Jest and Supertest syntax.`;

        const response = await this.llm.generate(prompt, {
            capability: LLM_CAPABILITIES.TEST_GENERATION,
        });

        if (response.success) {
            ctx.recordTokens(response.tokens_used);

            let code = response.content;
            const codeMatch = code.match(/```(?:javascript)?\s*([\s\S]*?)```/);
            if (codeMatch) {
                code = codeMatch[1];
            }

            return `/**
 * Security Tests - LSG v2 Generated
 * 
 * Target: ${target}
 * Vulnerability hypotheses: ${vulnClaims.length}
 */

const request = require('supertest');
const app = require('../app');

${code.trim()}
`;
        }

        // Fallback: generate template tests
        return this.generateTemplateSecurityTests(target, vulnClaims);
    }

    /**
     * Generate template security tests
     */
    generateTemplateSecurityTests(target, vulnClaims) {
        const tests = [];

        tests.push(`/**
 * Security Tests - LSG v2 Generated
 * 
 * Target: ${target}
 * Hypotheses: ${vulnClaims.length}
 */

const request = require('supertest');
const app = require('../app');

describe('Security Tests', () => {
`);

        for (const claim of vulnClaims.slice(0, 20)) {
            const vuln = claim.predicate;
            const endpoint = claim.subject;

            tests.push(`
  describe('${vuln.name || vuln.vuln_type}', () => {
    // Severity: ${vuln.severity}
    // Endpoint: ${endpoint}
    
    ${this.getVulnTestTemplate(vuln, endpoint)}
  });
`);
        }

        tests.push('});');

        return tests.join('\n');
    }

    getVulnTestTemplate(vuln, endpoint) {
        const type = vuln.vuln_type || '';

        if (type.includes('INJECTION') || type.includes('A03')) {
            return `it('should handle SQL injection payloads safely', async () => {
      const payloads = ["' OR '1'='1", "'; DROP TABLE users; --", "1; SELECT * FROM users"];
      
      for (const payload of payloads) {
        const response = await request(app)
          .get('${endpoint}')
          .query({ id: payload });
        
        expect(response.status).not.toBe(500);
        expect(response.text).not.toMatch(/sql|syntax|error/i);
      }
    });`;
        }

        if (type.includes('ACCESS') || type.includes('A01')) {
            return `it('should require authentication', async () => {
      const response = await request(app)
        .get('${endpoint}');
      
      // Should require auth
      expect([401, 403]).toContain(response.status);
    });
    
    it('should prevent horizontal privilege escalation', async () => {
      const response = await request(app)
        .get('${endpoint}'.replace(':id', '999999'))
        .set('Authorization', 'Bearer test-token');
      
      expect([403, 404]).toContain(response.status);
    });`;
        }

        if (type.includes('SSRF') || type.includes('A10')) {
            return `it('should block SSRF payloads', async () => {
      const payloads = [
        'http://localhost:22',
        'http://127.0.0.1:6379',
        'http://169.254.169.254/latest/meta-data/',
        'file:///etc/passwd',
      ];
      
      for (const payload of payloads) {
        const response = await request(app)
          .get('${endpoint}')
          .query({ url: payload });
        
        expect(response.status).toBe(400);
      }
    });`;
        }

        // Generic test
        return `it('should handle malicious input safely', async () => {
      const response = await request(app)
        .get('${endpoint}')
        .query({ test: '<script>alert(1)</script>' });
      
      expect(response.status).not.toBe(500);
    });`;
    }

    groupByResource(endpoints) {
        const groups = {};

        for (const ep of endpoints) {
            const path = ep.attributes.path || '/';
            const segments = path.split('/').filter(s => s && !s.startsWith(':'));
            const resource = segments.find(s => !['api', 'v1', 'v2'].includes(s)) || 'root';

            if (!groups[resource]) {
                groups[resource] = [];
            }
            groups[resource].push(ep);
        }

        return groups;
    }

    generateRequestBody(endpoint) {
        const method = (endpoint.attributes.method || 'GET').toUpperCase();
        const params = endpoint.attributes.params || [];

        if (!['POST', 'PUT', 'PATCH'].includes(method)) {
            return '';
        }

        const bodyParams = params.filter(p => p.location === 'body');
        if (bodyParams.length === 0) {
            return '.send({})';
        }

        const body = {};
        for (const p of bodyParams) {
            body[p.name] = this.getSampleValue(p.type);
        }

        return `.send(${JSON.stringify(body)})`;
    }

    getSampleValue(type) {
        const samples = {
            string: 'test',
            integer: 1,
            number: 1.0,
            boolean: true,
            email: 'test@example.com',
            uuid: '00000000-0000-0000-0000-000000000000',
        };
        return samples[type] || 'test';
    }

    getConfidence(ctx, endpoint) {
        const claims = ctx.ledger.getClaimsForSubject(endpoint.id);
        if (claims.length === 0) return 0.5;
        return claims[0].getExpectedProbability(ctx.ledger.config);
    }

    countTests(code) {
        const matches = code.match(/it\(/g);
        return matches ? matches.length : 0;
    }
}

export default TestGenAgent;
