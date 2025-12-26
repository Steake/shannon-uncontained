/**
 * ModelRegistry - Tracks available models and their reputations
 * 
 * Provides:
 * - Model registration with type classification
 * - Accuracy tracking based on verification outcomes
 * - Model lookup by prediction type
 */

export class ModelRegistry {
    constructor() {
        this.models = new Map(); // modelId -> ModelRecord
    }

    /**
     * Register a model
     * @param {string} id - Model identifier (e.g., 'filternet_bayes_v1')
     * @param {object} metadata - Model metadata
     */
    register(id, metadata = {}) {
        if (this.models.has(id)) return this.models.get(id);

        const record = {
            id,
            type: metadata.type || 'unknown',  // 'filter' | 'arch' | 'vuln'
            version: metadata.version || '1.0',
            predictions: 0,
            verified_correct: 0,
            verified_incorrect: 0,
            created_at: Date.now(),
            last_used: null,
        };

        this.models.set(id, record);
        return record;
    }

    /**
     * Get model by ID
     * @param {string} id - Model ID
     * @returns {object|null} Model record
     */
    get(id) {
        return this.models.get(id) || null;
    }

    /**
     * Get all models of a specific type
     * @param {string} type - Model type
     * @returns {object[]} Array of model records
     */
    getByType(type) {
        return Array.from(this.models.values()).filter(m => m.type === type);
    }

    /**
     * Record a prediction from a model
     * @param {string} modelId - Model ID
     */
    recordPrediction(modelId) {
        const model = this.models.get(modelId);
        if (model) {
            model.predictions++;
            model.last_used = Date.now();
        }
    }

    /**
     * Update model reputation based on verification outcome
     * @param {string} modelId - Model ID
     * @param {string} outcome - 'confirmed' | 'refuted'
     */
    updateReputation(modelId, outcome) {
        const model = this.models.get(modelId);
        if (!model) return;

        if (outcome === 'confirmed') {
            model.verified_correct++;
        } else if (outcome === 'refuted') {
            model.verified_incorrect++;
        }
    }

    /**
     * Get accuracy for a model (with prior)
     * @param {string} modelId - Model ID
     * @returns {number} Accuracy 0-1
     */
    getAccuracy(modelId) {
        const model = this.models.get(modelId);
        if (!model) return 0.5; // Prior

        const total = model.verified_correct + model.verified_incorrect;
        if (total === 0) return 0.5; // No verification data yet

        return model.verified_correct / total;
    }

    /**
     * Export registry state
     * @returns {object} Serializable state
     */
    export() {
        return {
            models: Array.from(this.models.values()),
            exported_at: new Date().toISOString(),
        };
    }

    /**
     * Import registry state
     * @param {object} state - Previously exported state
     */
    import(state) {
        if (!state || !state.models) return;

        for (const record of state.models) {
            this.models.set(record.id, record);
        }
    }

    /**
     * Get statistics
     * @returns {object} Registry stats
     */
    stats() {
        const models = Array.from(this.models.values());
        return {
            total_models: models.length,
            total_predictions: models.reduce((sum, m) => sum + m.predictions, 0),
            total_verified: models.reduce((sum, m) => sum + m.verified_correct + m.verified_incorrect, 0),
            by_type: {
                filter: models.filter(m => m.type === 'filter').length,
                arch: models.filter(m => m.type === 'arch').length,
                vuln: models.filter(m => m.type === 'vuln').length,
            }
        };
    }
}

// Singleton instance
export const modelRegistry = new ModelRegistry();
