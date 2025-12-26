/**
 * @deprecated Use WorldModel from src/core/WorldModel.js instead.
 * 
 * EvidenceGraph - Append-only evidence store with content hashing
 * 
 * DEPRECATION NOTICE: This module has been unified into WorldModel.
 * WorldModel now provides:
 * - EQBSL tensor storage on all evidence
 * - Evidence indices (evidenceByAgent, evidenceByType, evidenceByTarget)
 * - Integrated EpistemicLedger for uncertainty tracking
 * - EVENT_TYPES constant
 * 
 * The EvidenceGraph is the foundation of LSG v2's world model.
 * All observations from tools and agents are recorded as immutable events.
 */

import { createHash } from 'crypto';
import { fs, path } from 'zx';

/**
 * Generate content hash for an evidence event
 * @param {object} event - Event data (without id)
 * @returns {string} SHA-256 hash
 */
function contentHash(event) {
    const canonical = JSON.stringify(event, Object.keys(event).sort());
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * EvidenceGraph class - immutable event store
 */
export class EvidenceGraph {
    constructor(storePath = null) {
        this.events = new Map();      // id -> EvidenceEvent
        this.eventsBySource = new Map(); // source -> Set<id>
        this.eventsByTarget = new Map(); // target -> Set<id>
        this.eventsByType = new Map();   // event_type -> Set<id>
        this.storePath = storePath;
        this.blobStore = new Map();      // blobRef -> data
    }

    /**
     * Add an evidence event to the graph
     * @param {object} eventData - Event without id
     * @returns {string} Event ID (content hash)
     */
    addEvent(eventData) {
        const timestamp = eventData.timestamp || new Date().toISOString();
        const event = {
            ...eventData,
            timestamp,
        };

        // Generate content hash as ID
        const id = contentHash(event);
        event.id = id;

        // Append-only: if event exists, return existing ID
        if (this.events.has(id)) {
            return id;
        }

        // Store event
        this.events.set(id, Object.freeze(event));

        // Index by source
        if (event.source) {
            if (!this.eventsBySource.has(event.source)) {
                this.eventsBySource.set(event.source, new Set());
            }
            this.eventsBySource.get(event.source).add(id);
        }

        // Index by target
        if (event.target) {
            if (!this.eventsByTarget.has(event.target)) {
                this.eventsByTarget.set(event.target, new Set());
            }
            this.eventsByTarget.get(event.target).add(id);
        }

        // Index by type
        if (event.event_type) {
            if (!this.eventsByType.has(event.event_type)) {
                this.eventsByType.set(event.event_type, new Set());
            }
            this.eventsByType.get(event.event_type).add(id);
        }

        return id;
    }

    /**
     * Get event by ID
     * @param {string} id - Event ID
     * @returns {object|null} Event or null
     */
    getEvent(id) {
        return this.events.get(id) || null;
    }

    /**
     * Get all events from a source
     * @param {string} source - Source name (tool or agent)
     * @returns {object[]} Array of events
     */
    getEventsBySource(source) {
        const ids = this.eventsBySource.get(source) || new Set();
        return Array.from(ids).map(id => this.events.get(id));
    }

    /**
     * Get all events for a target
     * @param {string} target - Target identifier
     * @returns {object[]} Array of events
     */
    getEventsByTarget(target) {
        const ids = this.eventsByTarget.get(target) || new Set();
        return Array.from(ids).map(id => this.events.get(id));
    }

    /**
     * Get all events of a type
     * @param {string} eventType - Event type
     * @returns {object[]} Array of events
     */
    getEventsByType(eventType) {
        const ids = this.eventsByType.get(eventType) || new Set();
        return Array.from(ids).map(id => this.events.get(id));
    }

    /**
     * Get all events (for iteration/export)
     * @returns {object[]} All events
     */
    getAllEvents() {
        return Array.from(this.events.values());
    }

    /**
     * Store a blob and return reference
     * @param {Buffer|string} data - Blob data
     * @param {string} contentType - MIME type
     * @returns {string} Blob reference
     */
    storeBlob(data, contentType = 'application/octet-stream') {
        const hash = createHash('sha256')
            .update(typeof data === 'string' ? data : data.toString('base64'))
            .digest('hex')
            .slice(0, 16);

        const ref = `blob:${hash}`;
        this.blobStore.set(ref, { data, contentType });
        return ref;
    }

    /**
     * Retrieve a blob by reference
     * @param {string} ref - Blob reference
     * @returns {object|null} { data, contentType } or null
     */
    getBlob(ref) {
        return this.blobStore.get(ref) || null;
    }

    /**
     * Export graph state for persistence/replay
     * @returns {object} Serializable state
     */
    export() {
        return {
            version: '1.0.0',
            exported_at: new Date().toISOString(),
            events: Array.from(this.events.values()),
            blobs: Array.from(this.blobStore.entries()).map(([ref, { contentType }]) => ({
                ref,
                contentType,
                // Note: actual blob data stored separately for large blobs
            })),
        };
    }

    /**
     * Import graph state (for replay)
     * @param {object} state - Previously exported state
     */
    import(state) {
        if (state.events) {
            for (const event of state.events) {
                this.events.set(event.id, Object.freeze(event));

                // Rebuild indices
                if (event.source) {
                    if (!this.eventsBySource.has(event.source)) {
                        this.eventsBySource.set(event.source, new Set());
                    }
                    this.eventsBySource.get(event.source).add(event.id);
                }
                if (event.target) {
                    if (!this.eventsByTarget.has(event.target)) {
                        this.eventsByTarget.set(event.target, new Set());
                    }
                    this.eventsByTarget.get(event.target).add(event.id);
                }
                if (event.event_type) {
                    if (!this.eventsByType.has(event.event_type)) {
                        this.eventsByType.set(event.event_type, new Set());
                    }
                    this.eventsByType.get(event.event_type).add(event.id);
                }
            }
        }
    }

    /**
     * Persist to disk
     * @param {string} filePath - Path to save
     */
    async persist(filePath) {
        const state = this.export();
        await fs.writeFile(filePath, JSON.stringify(state, null, 2));
    }

    /**
     * Load from disk
     * @param {string} filePath - Path to load from
     */
    async load(filePath) {
        const data = await fs.readFile(filePath, 'utf-8');
        const state = JSON.parse(data);
        this.import(state);
    }

    /**
     * Get statistics
     * @returns {object} Graph statistics
     */
    stats() {
        return {
            total_events: this.events.size,
            sources: this.eventsBySource.size,
            targets: this.eventsByTarget.size,
            event_types: this.eventsByType.size,
            blobs: this.blobStore.size,
        };
    }
}

/**
 * Factory function for creating evidence events
 */
export function createEvidenceEvent({ source, event_type, target, payload, blob_refs = [] }) {
    return {
        source,
        event_type,
        target,
        payload,
        blob_refs,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Common event types
 */
export const EVENT_TYPES = {
    // Network recon
    HTTP_RESPONSE: 'http_response',
    PORT_SCAN: 'port_scan',
    DNS_RECORD: 'dns_record',
    TLS_CERT: 'tls_cert',

    // Crawling
    ENDPOINT_DISCOVERED: 'endpoint_discovered',
    FORM_DISCOVERED: 'form_discovered',
    LINK_DISCOVERED: 'link_discovered',

    // JS Analysis
    JS_FETCH_CALL: 'js_fetch_call',
    JS_ROUTE_STRING: 'js_route_string',
    JS_STATE_HINT: 'js_state_hint',

    // Schema
    OPENAPI_FRAGMENT: 'openapi_fragment',
    GRAPHQL_SCHEMA: 'graphql_schema',

    // Validation
    VALIDATION_RESULT: 'validation_result',

    // Tool status
    TOOL_ERROR: 'tool_error',
    TOOL_TIMEOUT: 'tool_timeout',

    // Email OSINT
    EMAIL_INTEL: 'email_intel',
    BREACH_DATA: 'breach_data',
    EMAIL_REPUTATION: 'email_reputation',
    SOCIAL_ACCOUNT: 'social_account',
};

export default EvidenceGraph;
