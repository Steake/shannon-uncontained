/**
 * Streaming - Real-time world model delta emission
 * 
 * Streaming output means streaming world-model deltas, not partial text logs.
 * Consumers can render progress, partial docs, early endpoint lists immediately.
 */

import { EventEmitter } from 'events';

/**
 * Delta types
 */
export const DELTA_TYPES = {
    EVIDENCE: 'evidence',
    CLAIM: 'claim',
    ENTITY: 'entity',
    EDGE: 'edge',
    ARTIFACT: 'artifact',
    VALIDATION: 'validation',
    STAGE: 'stage',
    PROGRESS: 'progress',
};

/**
 * StreamingEmitter - manages real-time delta emission
 */
export class StreamingEmitter extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            bufferSize: options.bufferSize || 100,
            flushInterval: options.flushInterval || 100,
            ...options,
        };

        this.buffer = [];
        this.subscribers = new Set();
        this.flushTimer = null;
        this.sequence = 0;
    }

    /**
     * Start streaming
     */
    start() {
        if (this.flushTimer) return;

        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.options.flushInterval);
    }

    /**
     * Stop streaming
     */
    stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush(); // Final flush
    }

    /**
     * Emit a delta
     * @param {string} type - Delta type
     * @param {object} data - Delta data
     */
    emitDelta(type, data) {
        const delta = {
            seq: this.sequence++,
            type,
            data,
            timestamp: Date.now(),
        };

        this.buffer.push(delta);
        this.emit('delta', delta);

        // Flush if buffer full
        if (this.buffer.length >= this.options.bufferSize) {
            this.flush();
        }
    }

    /**
     * Emit evidence delta
     * @param {object} event - Evidence event
     */
    emitEvidence(event) {
        this.emitDelta(DELTA_TYPES.EVIDENCE, {
            id: event.id,
            source: event.source,
            event_type: event.event_type,
            target: event.target,
        });
    }

    /**
     * Emit claim delta
     * @param {object} claim - Claim data
     */
    emitClaim(claim) {
        this.emitDelta(DELTA_TYPES.CLAIM, {
            id: claim.id,
            claim_type: claim.claim_type,
            subject: claim.subject,
            opinion: claim.opinion,
            expected_probability: claim.expected_probability,
        });
    }

    /**
     * Emit entity delta
     * @param {object} entity - Entity data
     */
    emitEntity(entity) {
        this.emitDelta(DELTA_TYPES.ENTITY, {
            id: entity.id,
            entity_type: entity.entity_type,
            attributes: entity.attributes,
        });
    }

    /**
     * Emit artifact delta
     * @param {object} artifact - Artifact entry
     */
    emitArtifact(artifact) {
        this.emitDelta(DELTA_TYPES.ARTIFACT, {
            path: artifact.path,
            epistemic: artifact.epistemic,
        });
    }

    /**
     * Emit validation delta
     * @param {string} path - Artifact path
     * @param {string} stage - Validation stage
     * @param {object} result - Validation result
     */
    emitValidation(path, stage, result) {
        this.emitDelta(DELTA_TYPES.VALIDATION, {
            path,
            stage,
            passed: result.passed,
        });
    }

    /**
     * Emit stage progress
     * @param {string} stage - Stage name
     * @param {string} status - Status (started/completed/failed)
     * @param {object} details - Additional details
     */
    emitStage(stage, status, details = {}) {
        this.emitDelta(DELTA_TYPES.STAGE, {
            stage,
            status,
            ...details,
        });
    }

    /**
     * Emit progress update
     * @param {number} current - Current progress
     * @param {number} total - Total items
     * @param {string} message - Progress message
     */
    emitProgress(current, total, message = '') {
        this.emitDelta(DELTA_TYPES.PROGRESS, {
            current,
            total,
            percent: total > 0 ? Math.round((current / total) * 100) : 0,
            message,
        });
    }

    /**
     * Flush buffer to subscribers
     */
    flush() {
        if (this.buffer.length === 0) return;

        const deltas = [...this.buffer];
        this.buffer = [];

        this.emit('flush', deltas);

        for (const subscriber of this.subscribers) {
            try {
                subscriber(deltas);
            } catch (err) {
                // Ignore subscriber errors
            }
        }
    }

    /**
     * Subscribe to delta batches
     * @param {function} callback - Callback receiving delta batches
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Get all deltas since sequence
     * @param {number} since - Sequence number
     * @returns {object[]} Deltas since sequence
     */
    getDeltasSince(since) {
        return this.buffer.filter(d => d.seq > since);
    }

    /**
     * Reset streaming state
     */
    reset() {
        this.buffer = [];
        this.sequence = 0;
    }
}

/**
 * Create a JSON Lines stream writer
 * @param {WritableStream} stream - Output stream
 * @returns {function} Subscriber function
 */
export function createJSONLinesWriter(stream) {
    return (deltas) => {
        for (const delta of deltas) {
            stream.write(JSON.stringify(delta) + '\n');
        }
    };
}

/**
 * Create a Server-Sent Events writer
 * @param {Response} res - HTTP response
 * @returns {function} Subscriber function
 */
export function createSSEWriter(res) {
    return (deltas) => {
        for (const delta of deltas) {
            res.write(`event: ${delta.type}\n`);
            res.write(`data: ${JSON.stringify(delta.data)}\n\n`);
        }
    };
}

export default StreamingEmitter;
