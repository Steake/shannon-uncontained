/**
 * TargetModel - Normalized entities and relationships derived from EvidenceGraph
 * 
 * The TargetModel provides a queryable representation of the target application.
 * It is deterministically derived from the EvidenceGraph.
 */

/**
 * Entity types in the target model
 */
export const ENTITY_TYPES = {
    ENDPOINT: 'endpoint',
    COMPONENT: 'component',
    DATA_MODEL: 'data_model',
    AUTH_FLOW: 'auth_flow',
    WORKFLOW: 'workflow',
    PARAMETER: 'parameter',
    HEADER: 'header',
    SERVICE: 'service',
};

/**
 * Relationship types between entities
 */
export const RELATIONSHIP_TYPES = {
    CALLS: 'calls',
    CONTAINS: 'contains',
    AUTHENTICATES: 'authenticates',
    FLOWS_TO: 'flows_to',
    DEPENDS_ON: 'depends_on',
    RETURNS: 'returns',
    ACCEPTS: 'accepts',
};

/**
 * TargetModel class - normalized entity graph
 */
export class TargetModel {
    constructor() {
        this.entities = new Map();      // id -> Entity
        this.entitiesByType = new Map(); // type -> Set<id>
        this.edges = [];                 // Array of { source, target, relationship, claim_refs }
        this.claimBindings = new Map();  // entity_id -> Set<claim_id>
        this.derivationVersion = 0;
    }

    /**
     * Add or update an entity
     * @param {object} entity - Entity data
     * @returns {string} Entity ID
     */
    addEntity({ id, entity_type, attributes = {}, claim_refs = [] }) {
        const entity = {
            id,
            entity_type,
            attributes,
            claim_refs,
            created_at: new Date().toISOString(),
        };

        this.entities.set(id, entity);

        // Index by type
        if (!this.entitiesByType.has(entity_type)) {
            this.entitiesByType.set(entity_type, new Set());
        }
        this.entitiesByType.get(entity_type).add(id);

        // Track claim bindings
        for (const claimId of claim_refs) {
            if (!this.claimBindings.has(id)) {
                this.claimBindings.set(id, new Set());
            }
            this.claimBindings.get(id).add(claimId);
        }

        return id;
    }

    /**
     * Get entity by ID
     * @param {string} id - Entity ID
     * @returns {object|null} Entity or null
     */
    getEntity(id) {
        return this.entities.get(id) || null;
    }

    /**
     * Get all entities of a type
     * @param {string} entityType - Entity type
     * @returns {object[]} Array of entities
     */
    getEntitiesByType(entityType) {
        const ids = this.entitiesByType.get(entityType) || new Set();
        return Array.from(ids).map(id => this.entities.get(id));
    }

    /**
     * Add an edge between entities
     * @param {object} edge - Edge data
     */
    addEdge({ source, target, relationship, claim_refs = [] }) {
        this.edges.push({
            source,
            target,
            relationship,
            claim_refs,
            created_at: new Date().toISOString(),
        });
    }

    /**
     * Get edges from an entity
     * @param {string} sourceId - Source entity ID
     * @returns {object[]} Array of edges
     */
    getEdgesFrom(sourceId) {
        return this.edges.filter(e => e.source === sourceId);
    }

    /**
     * Get edges to an entity
     * @param {string} targetId - Target entity ID
     * @returns {object[]} Array of edges
     */
    getEdgesTo(targetId) {
        return this.edges.filter(e => e.target === targetId);
    }

    /**
     * Get all endpoints
     * @returns {object[]} Endpoint entities
     */
    getEndpoints() {
        return this.getEntitiesByType(ENTITY_TYPES.ENDPOINT);
    }

    /**
     * Get all services/components
     * @returns {object[]} Service entities
     */
    getServices() {
        return this.getEntitiesByType(ENTITY_TYPES.SERVICE);
    }

    /**
     * Query entities by attribute
     * @param {string} entityType - Entity type to search
     * @param {function} predicate - Filter function
     * @returns {object[]} Matching entities
     */
    query(entityType, predicate) {
        return this.getEntitiesByType(entityType).filter(predicate);
    }

    /**
     * Derive model from EvidenceGraph (deterministic)
     * @param {EvidenceGraph} evidenceGraph - Source evidence
     * @param {EpistemicLedger} ledger - Claim ledger for opinions
     */
    deriveFromEvidence(evidenceGraph, ledger) {
        this.derivationVersion++;

        // Process endpoint discoveries
        const endpointEvents = evidenceGraph.getEventsByType('endpoint_discovered');
        for (const event of endpointEvents) {
            const { method, path, params } = event.payload;
            const endpointId = `endpoint:${method}:${path}`;

            // Find associated claims
            const claimRefs = ledger ?
                ledger.getClaimsForSubject(endpointId).map(c => c.id) :
                [];

            this.addEntity({
                id: endpointId,
                entity_type: ENTITY_TYPES.ENDPOINT,
                attributes: {
                    method,
                    path,
                    params: params || [],
                    evidence_refs: [event.id],
                },
                claim_refs: claimRefs,
            });

            // Add parameter entities
            if (params) {
                for (const param of params) {
                    const paramId = `param:${endpointId}:${param.name}`;
                    this.addEntity({
                        id: paramId,
                        entity_type: ENTITY_TYPES.PARAMETER,
                        attributes: {
                            name: param.name,
                            type: param.type || 'unknown',
                            location: param.location || 'query',
                            endpoint: endpointId,
                        },
                        claim_refs: [],
                    });

                    this.addEdge({
                        source: endpointId,
                        target: paramId,
                        relationship: RELATIONSHIP_TYPES.ACCEPTS,
                    });
                }
            }
        }

        // Process JS fetch calls for API relationships
        const fetchEvents = evidenceGraph.getEventsByType('js_fetch_call');
        for (const event of fetchEvents) {
            const { url, method } = event.payload;
            if (url) {
                const endpointId = `endpoint:${method || 'GET'}:${url}`;
                if (!this.entities.has(endpointId)) {
                    this.addEntity({
                        id: endpointId,
                        entity_type: ENTITY_TYPES.ENDPOINT,
                        attributes: {
                            method: method || 'GET',
                            path: url,
                            source: 'js_analysis',
                            evidence_refs: [event.id],
                        },
                        claim_refs: [],
                    });
                }
            }
        }

        // Process HTTP responses as endpoints (crawled URLs)
        const httpEvents = evidenceGraph.getEventsByType('http_response');
        for (const event of httpEvents) {
            const { url, status_code, method } = event.payload;
            if (url && status_code && status_code < 400) {
                try {
                    const parsedUrl = new URL(url);
                    const path = parsedUrl.pathname + parsedUrl.search;
                    const endpointId = `endpoint:${method || 'GET'}:${path}`;
                    if (!this.entities.has(endpointId)) {
                        this.addEntity({
                            id: endpointId,
                            entity_type: ENTITY_TYPES.ENDPOINT,
                            attributes: {
                                method: method || 'GET',
                                path,
                                source: 'crawler',
                                status_code,
                                evidence_refs: [event.id],
                            },
                            claim_refs: [],
                        });
                    }
                } catch { /* Invalid URL, skip */ }
            }
        }

        // Process OpenAPI fragments for structured endpoints
        const openapiEvents = evidenceGraph.getEventsByType('openapi_fragment');
        for (const event of openapiEvents) {
            const { paths } = event.payload;
            if (paths && typeof paths === 'object') {
                for (const [path, methods] of Object.entries(paths)) {
                    for (const method of Object.keys(methods)) {
                        const endpointId = `endpoint:${method.toUpperCase()}:${path}`;
                        if (!this.entities.has(endpointId)) {
                            this.addEntity({
                                id: endpointId,
                                entity_type: ENTITY_TYPES.ENDPOINT,
                                attributes: {
                                    method: method.toUpperCase(),
                                    path,
                                    source: 'openapi',
                                    evidence_refs: [event.id],
                                },
                                claim_refs: [],
                            });
                        }
                    }
                }
            }
        }

        // Process subdomain discoveries as services
        const subdomainEvents = evidenceGraph.getEventsByType('dns_record');
        for (const event of subdomainEvents) {
            const { subdomain, ip } = event.payload;
            if (subdomain) {
                const serviceId = `service:${subdomain}`;
                if (!this.entities.has(serviceId)) {
                    this.addEntity({
                        id: serviceId,
                        entity_type: ENTITY_TYPES.SERVICE,
                        attributes: {
                            name: subdomain,
                            ip,
                            source: 'subdomain_scan',
                            evidence_refs: [event.id],
                        },
                        claim_refs: [],
                    });
                }
            }
        }
    }

    /**
     * Export model state
     * @returns {object} Serializable state
     */
    export() {
        return {
            version: '1.0.0',
            derivation_version: this.derivationVersion,
            exported_at: new Date().toISOString(),
            entities: Array.from(this.entities.values()),
            edges: this.edges,
        };
    }

    /**
     * Import model state
     * @param {object} state - Previously exported state
     */
    import(state) {
        if (state.entities) {
            for (const entity of state.entities) {
                this.addEntity(entity);
            }
        }
        if (state.edges) {
            this.edges = state.edges;
        }
        this.derivationVersion = state.derivation_version || 0;
    }

    /**
     * Get statistics
     * @returns {object} Model statistics
     */
    stats() {
        return {
            total_entities: this.entities.size,
            entity_types: Object.fromEntries(
                Array.from(this.entitiesByType.entries()).map(([type, ids]) => [type, ids.size])
            ),
            total_edges: this.edges.length,
            derivation_version: this.derivationVersion,
        };
    }
}

/**
 * Factory for creating endpoint entities
 */
export function createEndpointEntity(method, path, options = {}) {
    return {
        id: `endpoint:${method}:${path}`,
        entity_type: ENTITY_TYPES.ENDPOINT,
        attributes: {
            method,
            path,
            ...options,
        },
        claim_refs: options.claim_refs || [],
    };
}

export default TargetModel;
