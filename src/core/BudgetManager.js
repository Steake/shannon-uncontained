
export class BudgetExceededError extends Error {
    constructor(metric, limit, current) {
        super(`Budget exceeded for ${metric}: ${current} > ${limit}`);
        this.name = 'BudgetExceededError';
        this.metric = metric;
    }
}

/**
 * Helper function to provide default values
 * @param {*} val - Value to check
 * @param {*} def - Default value if val is undefined
 * @returns {*} val if defined, otherwise def
 */
function defaultTo(val, def) {
    return val !== undefined ? val : def;
}

/**
 * BudgetManager - Enforces resource limits for the session.
 */
export class BudgetManager {
    constructor(limits = {}) {
        this.limits = {
            maxTimeMs: defaultTo(limits.maxTimeMs, 0),         // 0 = unlimited
            maxTokens: defaultTo(limits.maxTokens, 0),
            maxNetworkRequests: defaultTo(limits.maxNetworkRequests, 0),
            maxToolInvocations: defaultTo(limits.maxToolInvocations, 0),
        };

        this.usage = {
            startTime: Date.now(),
            tokens: 0,
            networkRequests: 0,
            toolInvocations: 0
        };
    }

    /**
     * Check if any budget is exceeded
     * @throws {BudgetExceededError}
     */
    check() {
        this._checkTime();
        this._checkLimit('maxTokens', 'tokens');
        this._checkLimit('maxNetworkRequests', 'networkRequests');
        this._checkLimit('maxToolInvocations', 'toolInvocations');
    }

    /**
     * Record usage of a resource
     * @param {string} metric - 'tokens', 'networkRequests', 'toolInvocations'
     * @param {number} amount - Amount to add (default 1)
     */
    track(metric, amount = 1) {
        if (this.usage[metric] !== undefined) {
            this.usage[metric] += amount;
            this.check();
        }
    }

    getRemaining() {
        // Simple mapping for limit keys to usage keys
        const limitToUsageMap = {
            maxTokens: 'tokens',
            maxNetworkRequests: 'networkRequests',
            maxToolInvocations: 'toolInvocations'
        };

        const remaining = {};
        for (const [limitKey, limitVal] of Object.entries(this.limits)) {
            if (limitVal === 0) {
                remaining[limitKey] = Infinity;
                continue;
            }

            if (limitKey === 'maxTimeMs') {
                const elapsed = Date.now() - this.usage.startTime;
                remaining[limitKey] = Math.max(0, limitVal - elapsed);
            } else {
                const usageKey = limitToUsageMap[limitKey];
                if (usageKey && this.usage[usageKey] !== undefined) {
                    remaining[limitKey] = Math.max(0, limitVal - this.usage[usageKey]);
                }
            }
        }
        return remaining;
    }

    _checkTime() {
        if (this.limits.maxTimeMs > 0) {
            const elapsed = Date.now() - this.usage.startTime;
            if (elapsed > this.limits.maxTimeMs) {
                throw new BudgetExceededError('timeMs', this.limits.maxTimeMs, elapsed);
            }
        }
    }

    _checkLimit(limitKey, usageKey) {
        const limit = this.limits[limitKey];
        const current = this.usage[usageKey];
        if (limit > 0 && current > limit) {
            throw new BudgetExceededError(usageKey, limit, current);
        }
    }
}
