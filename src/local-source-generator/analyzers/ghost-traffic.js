/**
 * Ghost Traffic Generator
 * 
 * Generates synthetic traffic patterns for testing race conditions,
 * behavioral mimicry, and adversarial fuzzing.
 */

/**
 * Traffic pattern templates
 */
const TRAFFIC_PATTERNS = {
    login: {
        sequence: [
            { method: 'GET', path: '/login', delay: 0 },
            { method: 'POST', path: '/login', delay: 500, body: true },
            { method: 'GET', path: '/dashboard', delay: 200 }
        ],
        description: 'Standard login flow'
    },
    browse: {
        sequence: [
            { method: 'GET', path: '/', delay: 0 },
            { method: 'GET', path: '/products', delay: 1000 },
            { method: 'GET', path: '/products/:id', delay: 800 },
            { method: 'POST', path: '/cart/add', delay: 300 }
        ],
        description: 'Product browsing pattern'
    },
    search: {
        sequence: [
            { method: 'GET', path: '/search?q=test', delay: 0 },
            { method: 'GET', path: '/search?q=test&page=2', delay: 1500 }
        ],
        description: 'Search pagination'
    },
    apiCrud: {
        sequence: [
            { method: 'GET', path: '/api/resource', delay: 0 },
            { method: 'POST', path: '/api/resource', delay: 200 },
            { method: 'PUT', path: '/api/resource/:id', delay: 150 },
            { method: 'DELETE', path: '/api/resource/:id', delay: 100 }
        ],
        description: 'REST CRUD operations'
    }
};

/**
 * Fuzzing payload categories
 */
const FUZZ_PAYLOADS = {
    sqlInjection: [
        "' OR '1'='1", "1' AND '1'='1", "1; DROP TABLE users--",
        "1 UNION SELECT null,null,null--", "' OR 1=1#"
    ],
    xss: [
        "<script>alert(1)</script>", "<img src=x onerror=alert(1)>",
        "javascript:alert(1)", "'><script>alert(1)</script>",
        "<svg/onload=alert(1)>"
    ],
    commandInjection: [
        "; id", "| id", "& id", "`id`", "$(id)"
    ],
    pathTraversal: [
        "../../../etc/passwd", "..\\..\\..\\windows\\system32\\config\\sam",
        "....//....//etc/passwd", "%2e%2e%2f%2e%2e%2f"
    ],
    ssrf: [
        "http://127.0.0.1", "http://localhost", "http://[::1]",
        "http://169.254.169.254/", "file:///etc/passwd"
    ]
};

/**
 * Generate sanitized replay traffic from discovered endpoints
 * 
 * @param {Array} endpoints - Discovered endpoints
 * @param {Object} options - Generation options
 * @returns {Array} - Replay traffic specifications
 */
export function generateReplayTraffic(endpoints, options = {}) {
    const {
        sanitize = true,
        includeParams = true,
        groupByPath = true
    } = options;

    const traffic = [];

    for (const endpoint of endpoints) {
        const request = {
            method: endpoint.method || 'GET',
            path: endpoint.path,
            params: {},
            headers: {},
            timing: {
                delay: Math.random() * 500 // Random human-like delay
            }
        };

        if (includeParams && endpoint.params) {
            for (const param of endpoint.params) {
                // Sanitize values for replay
                request.params[param.name] = sanitize
                    ? getSafeValue(param.type || 'string')
                    : param.value || 'test';
            }
        }

        traffic.push(request);
    }

    return groupByPath ? groupTrafficByBasePath(traffic) : traffic;
}

/**
 * Generate adversarial fuzzing requests
 * 
 * @param {Array} endpoints - Target endpoints
 * @param {Object} options - Fuzzing options
 * @returns {Array} - Fuzzing requests
 */
export function generateFuzzingRequests(endpoints, options = {}) {
    const {
        payloadTypes = Object.keys(FUZZ_PAYLOADS),
        maxPayloadsPerParam = 3
    } = options;

    const requests = [];

    for (const endpoint of endpoints) {
        if (!endpoint.params || endpoint.params.length === 0) continue;

        for (const param of endpoint.params) {
            for (const payloadType of payloadTypes) {
                const payloads = FUZZ_PAYLOADS[payloadType] || [];
                const selectedPayloads = payloads.slice(0, maxPayloadsPerParam);

                for (const payload of selectedPayloads) {
                    requests.push({
                        method: endpoint.method || 'GET',
                        path: endpoint.path,
                        targetParam: param.name,
                        payload,
                        payloadType,
                        originalValue: param.value
                    });
                }
            }
        }
    }

    return requests;
}

/**
 * Generate race condition test cases
 * 
 * @param {Array} endpoints - Target endpoints
 * @returns {Array} - Race condition test specifications
 */
export function generateRaceConditionTests(endpoints) {
    const tests = [];

    // Find endpoints that might be vulnerable to race conditions
    const candidates = endpoints.filter(ep => {
        const path = ep.path.toLowerCase();
        return (
            path.includes('transfer') ||
            path.includes('balance') ||
            path.includes('withdraw') ||
            path.includes('purchase') ||
            path.includes('redeem') ||
            path.includes('vote') ||
            path.includes('like') ||
            path.includes('coupon') ||
            path.includes('discount') ||
            (ep.method === 'POST' && path.includes('create'))
        );
    });

    for (const endpoint of candidates) {
        tests.push({
            type: 'concurrent_requests',
            endpoint: endpoint.path,
            method: endpoint.method || 'POST',
            concurrency: 10,
            description: `Race condition test: ${endpoint.path}`,
            exploit: 'Send multiple simultaneous requests to exploit TOCTOU',
            params: endpoint.params
        });
    }

    return tests;
}

/**
 * Generate behavioral mimicry patterns
 * 
 * @param {string} targetType - Type of user to mimic
 * @returns {Object} - Behavioral pattern
 */
export function generateBehavioralPattern(targetType = 'normal') {
    const patterns = {
        normal: {
            timing: { min: 500, max: 3000 },
            mouseMovement: true,
            scrolling: true,
            clickPattern: 'natural',
            userAgent: 'Chrome/Latest',
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        },
        bot: {
            timing: { min: 0, max: 100 },
            mouseMovement: false,
            scrolling: false,
            clickPattern: 'instant',
            userAgent: 'curl/7.64.1',
            headers: {}
        },
        mobile: {
            timing: { min: 800, max: 5000 },
            mouseMovement: false,
            scrolling: true,
            clickPattern: 'touch',
            userAgent: 'Mobile Safari',
            headers: {
                'Accept-Language': 'en-US',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }
    };

    return patterns[targetType] || patterns.normal;
}

// Helper functions

function getSafeValue(type) {
    const safeValues = {
        string: 'test',
        number: '1',
        integer: '1',
        email: 'test@example.com',
        url: 'https://example.com',
        boolean: 'true',
        date: '2024-01-01'
    };
    return safeValues[type] || 'test';
}

function groupTrafficByBasePath(traffic) {
    const groups = {};

    for (const req of traffic) {
        const basePath = '/' + (req.path.split('/')[1] || 'root');
        if (!groups[basePath]) {
            groups[basePath] = [];
        }
        groups[basePath].push(req);
    }

    return groups;
}

export { TRAFFIC_PATTERNS, FUZZ_PAYLOADS };
