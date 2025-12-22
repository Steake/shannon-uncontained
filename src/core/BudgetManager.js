
export class BudgetExceededError extends Error {
    constructor(metric, limit, current) {
        super(`Budget exceeded for ${metric}: ${current} > ${limit}`);
        this.name = 'BudgetExceededError';
        this.metric = metric;
    }
}

/**
 * BudgetManager - Enforces resource limits for the session.
 */
export class BudgetManager {
    constructor(limits = {}) {
        this.limits = {
            maxTimeMs: inputs(limits.maxTimeMs, 0),         // 0 = unlimited
            maxTokens: inputs(limits.maxTokens, 0),
            maxNetworkRequests: inputs(limits.maxNetworkRequests, 0),
            maxToolInvocations: inputs(limits.maxToolInvocations, 0),
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
                const usageKey = limitKey.replace('max', '').replace(/^[A-Z]/, c => c.toLowerCase()); // e.g. MaxTokens -> tokens
                // Simple mapping fix: 
                // maxTokens -> tokens
                // maxNetworkRequests -> networkRequests
                // maxToolInvocations -> toolInvocations
                const actualUsageKey = usageKey.charAt(0).toLowerCase() + usageKey.slice(1);

                if (this.usage[actualUsageKey] !== undefined) {
                    remaining[limitKey] = Math.max(0, limitVal - this.usage[actualUsageKey]);
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

function inputs(val, def) {
    return val !== undefined ? val : def;
}
