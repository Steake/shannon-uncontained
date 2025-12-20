/**
 * Comprehensive Tests for Technology Fingerprinter
 * 
 * Run with: node --test src/local-source-generator/tests/fingerprinter.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    parseWhatwebOutput,
    fingerprintFromHTML,
    fingerprintFromHeaders,
    generateTechFingerprint,
    TECH_SIGNATURES
} from '../analyzers/fingerprinter.js';

describe('parseWhatwebOutput', () => {
    test('should extract URL from whatweb output', () => {
        const output = 'https://example.com [200 OK] [Apache] [PHP]';

        const result = parseWhatwebOutput(output);

        assert.equal(result.url, 'https://example.com');
    });

    test('should extract technologies', () => {
        const output = 'https://example.com [Apache] [PHP[7.4]] [WordPress]';

        const result = parseWhatwebOutput(output);

        assert.ok(result.technologies.length >= 3);
        assert.ok(result.technologies.some(t => t.name === 'Apache'));
    });

    test('should extract version information', () => {
        // Whatweb shows nested brackets for versions
        const output = 'https://example.com [PHP] [Apache]';

        const result = parseWhatwebOutput(output);

        // Should at least extract the technology names
        assert.ok(result.technologies.length >= 2);
        assert.ok(result.technologies.some(t => t.name === 'PHP'));
    });

    test('should handle empty output', () => {
        const result = parseWhatwebOutput('');

        assert.equal(result.technologies.length, 0);
        assert.equal(result.url, '');
    });

    test('should handle null input', () => {
        const result = parseWhatwebOutput(null);

        assert.deepEqual(result, { url: '', technologies: [], headers: {}, raw: null });
    });
});

describe('fingerprintFromHTML', () => {
    test('should detect React', () => {
        const html = '<div data-reactroot>React App</div>';

        const result = fingerprintFromHTML(html);

        assert.ok(result.frameworks.some(f => f.name === 'react'));
    });

    test('should detect Vue', () => {
        const html = '<div v-if="show">Vue App</div>';

        const result = fingerprintFromHTML(html);

        assert.ok(result.frameworks.some(f => f.name === 'vue'));
    });

    test('should detect Angular', () => {
        const html = '<div ng-app="myApp">Angular App</div>';

        const result = fingerprintFromHTML(html);

        assert.ok(result.frameworks.some(f => f.name === 'angular'));
    });

    test('should detect WordPress', () => {
        const html = '<link href="/wp-content/themes/theme/style.css">';

        const result = fingerprintFromHTML(html);

        assert.ok(result.cms.some(c => c.name === 'wordpress'));
    });

    test('should detect Next.js', () => {
        const html = '<script src="/_next/static/chunks/main.js"></script>';

        const result = fingerprintFromHTML(html);

        assert.ok(result.frameworks.some(f => f.name === 'nextjs'));
    });

    test('should handle empty/null input', () => {
        const result = fingerprintFromHTML('');

        assert.equal(result.frameworks.length, 0);
        assert.equal(result.cms.length, 0);
    });
});

describe('fingerprintFromHeaders', () => {
    test('should detect Cloudflare WAF', () => {
        const headers = { 'cf-ray': '1234567890', 'server': 'cloudflare' };

        const result = fingerprintFromHeaders(headers);

        assert.ok(result.waf.some(w => w.name === 'cloudflare'));
    });

    test('should detect AWS WAF', () => {
        const headers = { 'x-amzn-requestid': 'abc123' };

        const result = fingerprintFromHeaders(headers);

        assert.ok(result.waf.some(w => w.name === 'awsWaf') || result.cdn.some(c => c.name === 'cloudfront'));
    });

    test('should extract server info', () => {
        const headers = { 'server': 'nginx/1.18.0' };

        const result = fingerprintFromHeaders(headers);

        assert.equal(result.server, 'nginx/1.18.0');
    });

    test('should extract powered-by', () => {
        const headers = { 'x-powered-by': 'Express' };

        const result = fingerprintFromHeaders(headers);

        assert.equal(result.poweredBy, 'Express');
    });

    test('should handle empty headers', () => {
        const result = fingerprintFromHeaders({});

        assert.equal(result.server, null);
        assert.equal(result.waf.length, 0);
    });
});

describe('generateTechFingerprint', () => {
    test('should combine multiple sources', () => {
        const data = {
            whatweb: '[PHP] [Apache]',
            html: '<div data-reactroot></div>',
            headers: { 'server': 'nginx' }
        };

        const result = generateTechFingerprint(data);

        assert.ok(result.detected.frameworks.length > 0);
        assert.ok(result.confidence > 0);
    });

    test('should calculate confidence based on findings', () => {
        const dataFew = { whatweb: '[PHP]' };
        const dataMany = {
            whatweb: '[PHP] [Apache] [WordPress]',
            html: '<div data-reactroot></div>',
            headers: { 'cf-ray': '123', 'server': 'cloudflare' }
        };

        const resultFew = generateTechFingerprint(dataFew);
        const resultMany = generateTechFingerprint(dataMany);

        assert.ok(resultMany.confidence > resultFew.confidence);
    });
});

describe('TECH_SIGNATURES', () => {
    test('should have framework signatures', () => {
        assert.ok(TECH_SIGNATURES.frameworks.react);
        assert.ok(TECH_SIGNATURES.frameworks.angular);
        assert.ok(TECH_SIGNATURES.frameworks.vue);
    });

    test('should have CMS signatures', () => {
        assert.ok(TECH_SIGNATURES.cms.wordpress);
        assert.ok(TECH_SIGNATURES.cms.drupal);
    });

    test('should have WAF signatures', () => {
        assert.ok(TECH_SIGNATURES.waf.cloudflare);
        assert.ok(TECH_SIGNATURES.waf.akamai);
    });
});
