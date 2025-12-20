/**
 * Comprehensive Tests for Shadow IT Hunter
 * 
 * Run with: node --test src/local-source-generator/tests/shadow-it.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    extractCloudBuckets,
    identifyDevEnvironments,
    correlateCloudAssets,
    CLOUD_SIGNATURES,
    DEV_INDICATORS
} from '../analyzers/shadow-it.js';

describe('extractCloudBuckets', () => {
    test('should extract S3 bucket URLs', () => {
        const content = 'const img = "https://my-bucket.s3.us-east-1.amazonaws.com/image.png"';

        const result = extractCloudBuckets(content);

        assert.ok(result.length > 0, 'Should extract S3 bucket URL');
        assert.equal(result[0].provider, 'aws');
    });

    test('should extract Azure blob URLs', () => {
        const content = 'https://myaccount.blob.core.windows.net/container/file';

        const result = extractCloudBuckets(content);

        assert.ok(result.some(b => b.provider === 'azure'));
    });

    test('should extract GCP storage URLs', () => {
        const content = 'https://storage.googleapis.com/my-bucket/file.json';

        const result = extractCloudBuckets(content);

        assert.ok(result.some(b => b.provider === 'gcp'));
    });

    test('should deduplicate results', () => {
        const content = `
            "https://bucket.s3.amazonaws.com/a.png"
            "https://bucket.s3.amazonaws.com/b.png"
        `;

        const result = extractCloudBuckets(content);

        // Should only have unique bucket URLs
        const urls = result.map(r => r.url);
        assert.equal(urls.length, new Set(urls).size);
    });

    test('should handle empty/null input', () => {
        assert.deepEqual(extractCloudBuckets(''), []);
        assert.deepEqual(extractCloudBuckets(null), []);
    });
});

describe('identifyDevEnvironments', () => {
    test('should identify dev subdomains', () => {
        const subdomains = ['dev.example.com', 'staging.example.com', 'www.example.com'];

        const result = identifyDevEnvironments(subdomains);

        assert.ok(result.length >= 2);
        assert.ok(result.every(r => r.type === 'dev_environment'));
    });

    test('should identify staging subdomains', () => {
        const subdomains = ['staging.example.com', 'stg.example.com'];

        const result = identifyDevEnvironments(subdomains);

        assert.equal(result.length, 2);
    });

    test('should identify QA/UAT environments', () => {
        const subdomains = ['qa.example.com', 'uat.example.com'];

        const result = identifyDevEnvironments(subdomains);

        assert.equal(result.length, 2);
    });

    test('should not flag production subdomains', () => {
        const subdomains = ['www.example.com', 'api.example.com', 'app.example.com'];

        const result = identifyDevEnvironments(subdomains);

        assert.equal(result.length, 0);
    });

    test('should include risk assessment', () => {
        const subdomains = ['dev.example.com'];

        const result = identifyDevEnvironments(subdomains);

        assert.equal(result[0].risk, 'high');
        assert.ok(result[0].recommendation);
    });
});

describe('correlateCloudAssets', () => {
    test('should correlate URLs with AWS', () => {
        const reconData = {
            endpoints: [{ source: 'https://s3.amazonaws.com/bucket/file' }],
            jsFiles: []
        };

        const result = correlateCloudAssets(reconData);

        assert.ok(result.providers.aws);
        assert.ok(result.providers.aws.length > 0);
    });

    test('should handle multiple providers', () => {
        const reconData = {
            endpoints: [
                { source: 'https://s3.amazonaws.com/bucket' },
                { source: 'https://storage.googleapis.com/bucket' }
            ],
            jsFiles: []
        };

        const result = correlateCloudAssets(reconData);

        assert.ok(result.providers.aws);
        assert.ok(result.providers.gcp);
    });

    test('should include summary counts', () => {
        const reconData = {
            endpoints: [
                { source: 'https://s3.amazonaws.com/a' },
                { source: 'https://s3.amazonaws.com/b' }
            ],
            jsFiles: []
        };

        const result = correlateCloudAssets(reconData);

        assert.equal(result.summary.aws, 2);
    });
});

describe('Constants', () => {
    test('CLOUD_SIGNATURES should have all providers', () => {
        assert.ok(CLOUD_SIGNATURES.aws);
        assert.ok(CLOUD_SIGNATURES.azure);
        assert.ok(CLOUD_SIGNATURES.gcp);
        assert.ok(CLOUD_SIGNATURES.digitalocean);
    });

    test('DEV_INDICATORS should have subdomains', () => {
        assert.ok(DEV_INDICATORS.subdomains.includes('dev'));
        assert.ok(DEV_INDICATORS.subdomains.includes('staging'));
        assert.ok(DEV_INDICATORS.subdomains.includes('qa'));
    });

    test('DEV_INDICATORS should have sensitive paths', () => {
        assert.ok(DEV_INDICATORS.paths.some(p => p.includes('debug')));
        assert.ok(DEV_INDICATORS.files.some(f => f.includes('.env')));
    });
});
