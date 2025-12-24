/**
 * FeatureCollector - ML Training Data Collector
 * 
 * Streams agent observations to a JSONL file for offline training
 * of FilterNet and ArchNet models.
 */

import { fs, path } from 'zx';

export class FeatureCollector {
    constructor(outputDir) {
        this.outputDir = outputDir;
        this.stream = null;
        this.buffer = [];
        this.flushInterval = 5000;
        this.flushing = false;
    }

    async init() {
        if (this.stream) return;

        const mlDir = path.join(this.outputDir, 'ml-training');
        await fs.ensureDir(mlDir);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(mlDir, `training-data-${timestamp}.jsonl`);

        this.stream = fs.createWriteStream(filePath, { flags: 'a' });

        // Periodic flush
        setInterval(() => this.flush(), this.flushInterval);
    }

    /**
     * Log a URL observation for FilterNet training
     * @param {object} features 
     */
    logFilterData(features) {
        // Essential features for URL classification
        const datum = {
            type: 'filter_net',
            timestamp: Date.now(),
            features: {
                url: features.url,
                path: features.path,
                method: features.method,
                resourceType: features.resourceType,
                contentType: features.contentType || null,
                contentLength: features.contentLength || 0,
                // Labels & Predictions
                heuristic_label: features.heuristic_label || (features.isNoise ? 'noise' : 'signal'),
                prediction_score: features.prediction_score,
                prediction_model: features.prediction_model
            }
        };

        this.buffer.push(JSON.stringify(datum));
        if (this.buffer.length > 100) this.flush();
    }

    /**
     * Log an architecture observation for ArchNet training
     * @param {object} features 
     */
    logArchData(features) {
        const datum = {
            type: 'arch_net',
            timestamp: Date.now(),
            features: {
                url: features.url,
                headers: features.headers, // subset of interesting headers
                html_tags: features.htmlTags, // e.g. <div id="__next">
                cookies: features.cookies,
                // Soft label
                heuristic_framework: features.inferredFramework
            }
        };

        this.buffer.push(JSON.stringify(datum));
    }

    async flush() {
        if (this.flushing || this.buffer.length === 0 || !this.stream) return;

        this.flushing = true;
        const chunk = this.buffer.join('\n') + '\n';
        this.buffer = [];

        try {
            this.stream.write(chunk);
        } catch (err) {
            console.error('Failed to write ML training data:', err);
        } finally {
            this.flushing = false;
        }
    }

    async close() {
        await this.flush();
        if (this.stream) this.stream.end();
    }
}
