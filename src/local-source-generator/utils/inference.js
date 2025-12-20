/**
 * Inference Utilities for Local Source Generator
 * 
 * Provides smart inference of parameter types, HTTP methods, and model schemas.
 */

/**
 * Infer parameter type from name and sample value
 * 
 * @param {string} paramName - Parameter name
 * @param {string} sampleValue - Sample value (optional)
 * @returns {Object} - { type, format?, isSecurityRelevant, candidateFor }
 */
export function inferParameterType(paramName, sampleValue = '') {
    const name = paramName.toLowerCase();
    const value = String(sampleValue);

    // ID patterns - likely integer
    if (name.match(/^(id|.*_id|.*id|uid|pid|gid|user_id|order_id|product_id|item_id)$/i)) {
        return {
            type: 'integer',
            isSecurityRelevant: true,
            candidateFor: ['IDOR', 'SQLi']
        };
    }

    // Pagination
    if (name.match(/^(page|limit|offset|per_page|page_size|skip|take)$/i)) {
        return {
            type: 'integer',
            isSecurityRelevant: false,
            candidateFor: []
        };
    }

    // Email patterns
    if (name.match(/^(email|mail|e-mail|email_address|user_email)$/i)) {
        return {
            type: 'string',
            format: 'email',
            isSecurityRelevant: true,
            candidateFor: ['SQLi', 'Account Enumeration']
        };
    }

    // URL patterns - SSRF candidates
    if (name.match(/^(url|uri|link|href|src|redirect|callback|next|return|goto|destination|target|path|file)$/i)) {
        return {
            type: 'string',
            format: 'uri',
            isSecurityRelevant: true,
            candidateFor: ['SSRF', 'Open Redirect', 'LFI']
        };
    }

    // File patterns - LFI/Path Traversal
    if (name.match(/^(file|filename|filepath|path|doc|document|attachment|image|upload)$/i)) {
        return {
            type: 'string',
            isSecurityRelevant: true,
            candidateFor: ['LFI', 'Path Traversal', 'File Upload']
        };
    }

    // Command patterns - Command Injection
    if (name.match(/^(cmd|command|exec|run|shell|ping|host|ip|domain)$/i)) {
        return {
            type: 'string',
            isSecurityRelevant: true,
            candidateFor: ['Command Injection', 'SSRF']
        };
    }

    // Search/Query - SQLi/XSS
    if (name.match(/^(q|query|search|keyword|term|filter|sort|order|where|select)$/i)) {
        return {
            type: 'string',
            isSecurityRelevant: true,
            candidateFor: ['SQLi', 'XSS', 'NoSQLi']
        };
    }

    // Content/Text - XSS candidates
    if (name.match(/^(content|text|body|message|comment|description|bio|about|title|name|username)$/i)) {
        return {
            type: 'string',
            isSecurityRelevant: true,
            candidateFor: ['XSS', 'SQLi']
        };
    }

    // Password
    if (name.match(/^(password|passwd|pwd|pass|secret|token)$/i)) {
        return {
            type: 'string',
            format: 'password',
            isSecurityRelevant: true,
            candidateFor: ['Auth Bypass', 'Brute Force']
        };
    }

    // Boolean patterns
    if (name.match(/^(is_|has_|can_|should_|enable|disable|active|verified|admin|debug)/i)) {
        return {
            type: 'boolean',
            isSecurityRelevant: name.match(/admin|debug|verified/i) ? true : false,
            candidateFor: name.match(/admin/i) ? ['Privilege Escalation'] : []
        };
    }

    // Date patterns
    if (name.match(/^(date|time|created|updated|timestamp|start|end|from|to|when)$/i)) {
        return {
            type: 'string',
            format: 'date-time',
            isSecurityRelevant: false,
            candidateFor: []
        };
    }

    // Try to infer from value
    if (value) {
        if (value.match(/^\d+$/)) {
            return { type: 'integer', isSecurityRelevant: false, candidateFor: [] };
        }
        if (value.match(/^\d+\.\d+$/)) {
            return { type: 'number', isSecurityRelevant: false, candidateFor: [] };
        }
        if (value === 'true' || value === 'false') {
            return { type: 'boolean', isSecurityRelevant: false, candidateFor: [] };
        }
        if (value.match(/^https?:\/\//)) {
            return { type: 'string', format: 'uri', isSecurityRelevant: true, candidateFor: ['SSRF'] };
        }
        if (value.match(/@.*\./)) {
            return { type: 'string', format: 'email', isSecurityRelevant: true, candidateFor: [] };
        }
    }

    // Default to string
    return {
        type: 'string',
        isSecurityRelevant: false,
        candidateFor: []
    };
}

/**
 * Infer HTTP method from endpoint path and context
 * 
 * @param {string} path - Endpoint path
 * @param {Object} context - Additional context (hasBody, formAction, etc.)
 * @returns {string} - HTTP method (GET, POST, PUT, DELETE, PATCH)
 */
export function inferHttpMethod(path, context = {}) {
    const pathLower = path.toLowerCase();

    // Explicit method indicators in path
    if (pathLower.match(/\/(create|add|new|register|signup|submit|upload|import)($|\/|\?)/)) {
        return 'POST';
    }

    if (pathLower.match(/\/(delete|remove|destroy|unsubscribe)($|\/|\?)/)) {
        return 'DELETE';
    }

    if (pathLower.match(/\/(update|edit|modify|change|patch)($|\/|\?)/)) {
        return context.isPartialUpdate ? 'PATCH' : 'PUT';
    }

    // Login/Auth typically POST
    if (pathLower.match(/\/(login|signin|auth|authenticate|logout|signout)($|\/|\?)/)) {
        return 'POST';
    }

    // Form submissions
    if (context.isFormAction) {
        return 'POST';
    }

    // Has request body
    if (context.hasBody) {
        return 'POST';
    }

    // API resource patterns with ID - could be GET (single) or PUT/DELETE
    if (pathLower.match(/\/api\/.*\/\d+$/)) {
        // Without more context, assume GET for retrieval
        return context.isModification ? 'PUT' : 'GET';
    }

    // Default to GET
    return 'GET';
}

/**
 * Infer model schema from form fields
 * 
 * @param {Array} formFields - Array of { name, type, required, placeholder }
 * @returns {Object} - JSON Schema-like model definition
 */
export function inferModelSchema(formFields) {
    const properties = {};
    const required = [];

    for (const field of formFields) {
        const paramType = inferParameterType(field.name, field.placeholder || '');

        properties[field.name] = {
            type: paramType.type,
            ...(paramType.format && { format: paramType.format }),
            ...(field.placeholder && { example: field.placeholder }),
            ...(paramType.isSecurityRelevant && { 'x-security-relevant': true }),
            ...(paramType.candidateFor.length > 0 && { 'x-candidate-for': paramType.candidateFor })
        };

        if (field.required) {
            required.push(field.name);
        }
    }

    return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required })
    };
}

/**
 * Generate security annotations for an endpoint
 * 
 * @param {Object} endpoint - { path, method, params }
 * @returns {Object} - Security annotations
 */
export function generateSecurityAnnotations(endpoint) {
    const annotations = {
        vulnerabilityHints: [],
        parameterRisks: {}
    };

    // Analyze each parameter
    for (const [paramName, paramValue] of Object.entries(endpoint.params || {})) {
        const inference = inferParameterType(paramName, paramValue);

        if (inference.isSecurityRelevant) {
            annotations.parameterRisks[paramName] = {
                type: inference.type,
                candidateFor: inference.candidateFor
            };

            // Add to vulnerability hints
            for (const vuln of inference.candidateFor) {
                if (!annotations.vulnerabilityHints.includes(vuln)) {
                    annotations.vulnerabilityHints.push(vuln);
                }
            }
        }
    }

    // Path-based hints
    if (endpoint.path.match(/\/admin\//i)) {
        annotations.vulnerabilityHints.push('Authorization Bypass');
    }

    if (endpoint.path.match(/\/api\//i)) {
        annotations.vulnerabilityHints.push('API Security');
    }

    return annotations;
}
