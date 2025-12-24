/**
 * OWASP ASVS Compliance Mapping
 * 
 * Maps LSGv2 findings to OWASP Application Security Verification Standard
 * requirements for compliance reporting.
 */

/**
 * ASVS v4.0.3 Requirements mapping
 * Organized by verification level (L1, L2, L3)
 */
export const ASVS_REQUIREMENTS = {
    // V1: Architecture, Design and Threat Modeling
    V1: {
        name: 'Architecture, Design and Threat Modeling',
        requirements: {
            '1.1.1': { level: 1, description: 'Secure software development lifecycle in use' },
            '1.2.1': { level: 1, description: 'User accounts have unique identifiers' },
            '1.4.1': { level: 1, description: 'Access control applied at trusted enforcement points' },
        }
    },

    // V2: Authentication
    V2: {
        name: 'Authentication',
        requirements: {
            '2.1.1': { level: 1, description: 'User set passwords are at least 12 characters' },
            '2.1.2': { level: 1, description: 'Passwords of at least 64 characters are permitted' },
            '2.1.5': { level: 1, description: 'Users can change their password' },
            '2.1.7': { level: 1, description: 'Passwords submitted are checked against known weak passwords' },
            '2.2.1': { level: 1, description: 'Anti-automation controls effective against credential testing' },
            '2.3.1': { level: 1, description: 'System generated initial passwords are secure random' },
            '2.5.1': { level: 1, description: 'Password recovery does not reveal current password' },
            '2.7.1': { level: 1, description: 'OTP tokens are properly validated' },
            '2.8.1': { level: 2, description: 'Time-based OTP with shared secret is used if MFA' },
        }
    },

    // V3: Session Management
    V3: {
        name: 'Session Management',
        requirements: {
            '3.1.1': { level: 1, description: 'Session token is not revealed in URL' },
            '3.2.1': { level: 1, description: 'Sufficient session token entropy (64-bit)' },
            '3.2.2': { level: 1, description: 'Session tokens behave as strict cookies' },
            '3.3.1': { level: 1, description: 'Logout terminates session' },
            '3.4.1': { level: 1, description: 'Cookie-based session tokens have Secure attribute' },
            '3.4.2': { level: 1, description: 'Cookie-based session tokens have HttpOnly attribute' },
            '3.4.3': { level: 1, description: 'Cookie-based session tokens use SameSite attribute' },
            '3.5.1': { level: 1, description: 'OAuth and OIDC properly implemented' },
        }
    },

    // V4: Access Control
    V4: {
        name: 'Access Control',
        requirements: {
            '4.1.1': { level: 1, description: 'Application enforces access control on trusted service layer' },
            '4.1.2': { level: 1, description: 'Access control data integrity protected' },
            '4.1.3': { level: 1, description: 'Principle of least privilege enforced' },
            '4.2.1': { level: 1, description: 'Sensitive data and APIs protected against IDOR' },
            '4.3.1': { level: 1, description: 'Admin interfaces use appropriate multi-factor authentication' },
        }
    },

    // V5: Validation, Sanitization, and Encoding
    V5: {
        name: 'Validation, Sanitization, and Encoding',
        requirements: {
            '5.1.1': { level: 1, description: 'HTTP parameter pollution defenses in place' },
            '5.1.3': { level: 1, description: 'All input is validated as positive validation' },
            '5.2.1': { level: 1, description: 'HTML form submissions protected from CSRF' },
            '5.2.2': { level: 1, description: 'Mass assignment attacks mitigated' },
            '5.3.1': { level: 1, description: 'Output encoding relevant for the interpreter' },
            '5.3.3': { level: 1, description: 'Context-aware output escaping protects against XSS' },
            '5.3.4': { level: 1, description: 'Data selection or database queries use parameterized queries' },
        }
    },

    // V6: Stored Cryptography
    V6: {
        name: 'Stored Cryptography',
        requirements: {
            '6.1.1': { level: 1, description: 'Regulated private data stored encrypted' },
            '6.2.1': { level: 1, description: 'All cryptographic modules fail securely' },
            '6.2.2': { level: 1, description: 'Industry proven cryptographic algorithms used' },
            '6.4.1': { level: 2, description: 'Key management solution exists' },
        }
    },

    // V7: Error Handling and Logging
    V7: {
        name: 'Error Handling and Logging',
        requirements: {
            '7.1.1': { level: 1, description: 'Application does not log credentials or payment details' },
            '7.1.2': { level: 1, description: 'Application does not log sensitive data' },
            '7.2.1': { level: 1, description: 'All authentication decisions are logged' },
            '7.2.2': { level: 1, description: 'All access control decisions are logged' },
            '7.4.1': { level: 1, description: 'Generic error message is shown' },
        }
    },

    // V8: Data Protection
    V8: {
        name: 'Data Protection',
        requirements: {
            '8.1.1': { level: 1, description: 'Application protects sensitive data from caching' },
            '8.2.1': { level: 1, description: 'Application sets sufficient anti-caching headers' },
            '8.3.1': { level: 1, description: 'Sensitive data sent to server over TLS' },
            '8.3.4': { level: 1, description: 'Sensitive data encrypted if backed up' },
        }
    },

    // V9: Communication
    V9: {
        name: 'Communication',
        requirements: {
            '9.1.1': { level: 1, description: 'TLS used for all client connectivity' },
            '9.1.2': { level: 1, description: 'TLS 1.2 or higher in use' },
            '9.1.3': { level: 1, description: 'Only strong cipher suites enabled' },
            '9.2.1': { level: 1, description: 'Connection to system components encrypted' },
        }
    },

    // V10: Malicious Code
    V10: {
        name: 'Malicious Code',
        requirements: {
            '10.2.1': { level: 1, description: 'Application does not ask for unnecessary permissions' },
            '10.3.1': { level: 1, description: 'Application source code does not contain backdoors' },
        }
    },

    // V11: Business Logic
    V11: {
        name: 'Business Logic',
        requirements: {
            '11.1.1': { level: 1, description: 'Application processes business logic flows sequentially' },
            '11.1.2': { level: 1, description: 'Application processes business logic in realistic time' },
        }
    },

    // V12: Files and Resources
    V12: {
        name: 'Files and Resources',
        requirements: {
            '12.1.1': { level: 1, description: 'Application does not accept large files' },
            '12.3.1': { level: 1, description: 'File metadata not exposed to end users' },
            '12.4.1': { level: 1, description: 'Files from untrusted sources stored outside webroot' },
        }
    },

    // V13: API and Web Service
    V13: {
        name: 'API and Web Service',
        requirements: {
            '13.1.1': { level: 1, description: 'All API responses contain Content-Type header' },
            '13.1.3': { level: 1, description: 'API URLs do not expose sensitive information' },
            '13.2.1': { level: 1, description: 'Enabled REST methods are valid choices' },
            '13.2.2': { level: 1, description: 'JSON schema validation in place' },
        }
    },

    // V14: Configuration
    V14: {
        name: 'Configuration',
        requirements: {
            '14.1.1': { level: 1, description: 'Application build and deployment processes automated' },
            '14.2.1': { level: 1, description: 'All components are up to date' },
            '14.3.1': { level: 1, description: 'Web server returns appropriate security headers' },
            '14.4.1': { level: 1, description: 'Application origin is trusted' },
            '14.5.1': { level: 1, description: 'HTTP request headers are validated' },
        }
    }
};

/**
 * Mapping of LSGv2 claim types to ASVS requirements
 */
export const CLAIM_TO_ASVS_MAP = {
    // Authentication vulnerabilities
    'weak_password_policy': ['2.1.1', '2.1.7'],
    'missing_mfa': ['2.8.1'],
    'credential_exposed': ['2.1.1', '6.1.1'],
    'auth_bypass': ['2.2.1', '4.1.1'],

    // Session vulnerabilities
    'session_fixation': ['3.2.1', '3.3.1'],
    'session_in_url': ['3.1.1'],
    'missing_secure_cookie': ['3.4.1'],
    'missing_httponly_cookie': ['3.4.2'],
    'missing_samesite_cookie': ['3.4.3'],

    // Access control vulnerabilities
    'idor': ['4.2.1'],
    'broken_access_control': ['4.1.1', '4.1.2', '4.1.3'],
    'privilege_escalation': ['4.1.3'],
    'admin_interface_exposed': ['4.3.1'],

    // Injection vulnerabilities
    'sqli_vulnerability': ['5.3.4'],
    'xss_vulnerability': ['5.3.1', '5.3.3'],
    'reflected_xss': ['5.3.3'],
    'stored_xss': ['5.3.3'],
    'dom_xss': ['5.3.3'],
    'command_injection': ['5.1.3'],
    'ssrf': ['5.1.3'],
    'lfi': ['5.1.3', '12.4.1'],
    'rfi': ['5.1.3', '12.4.1'],

    // Cryptography vulnerabilities
    'weak_tls_config': ['9.1.2', '9.1.3'],
    'expired_certificate': ['9.1.1'],
    'deprecated_protocol': ['9.1.2'],
    'weak_ciphers': ['9.1.3'],

    // Security headers
    'missing_security_header': ['14.3.1'],
    'missing_hsts': ['9.1.1', '14.3.1'],
    'missing_csp': ['5.3.3', '14.3.1'],
    'missing_x_frame_options': ['14.3.1'],

    // Data protection
    'sensitive_data_exposed': ['6.1.1', '8.3.1'],
    'api_key_leaked': ['6.4.1'],
    'private_key_exposed': ['6.4.1'],

    // Other
    'information_disclosure': ['7.4.1', '12.3.1'],
    'debug_mode_enabled': ['14.2.1'],
    'backup_file_found': ['12.3.1'],
    'git_exposed': ['10.3.1'],
};

/**
 * Map a finding to ASVS requirements
 * @param {string} claimType - LSGv2 claim type
 * @returns {object[]} Matching ASVS requirements
 */
export function mapToASVS(claimType) {
    const reqIds = CLAIM_TO_ASVS_MAP[claimType] || [];
    const results = [];

    for (const reqId of reqIds) {
        // Parse chapter from ID (e.g., "5.3.4" -> "V5")
        const chapter = `V${reqId.split('.')[0]}`;
        const chapterData = ASVS_REQUIREMENTS[chapter];

        if (chapterData?.requirements?.[reqId]) {
            results.push({
                id: reqId,
                chapter: chapter,
                chapterName: chapterData.name,
                level: chapterData.requirements[reqId].level,
                description: chapterData.requirements[reqId].description
            });
        }
    }

    return results;
}

/**
 * Generate ASVS compliance report from findings
 * @param {object[]} findings - Array of findings with claim_type
 * @returns {object} Compliance report
 */
export function generateComplianceReport(findings) {
    const report = {
        totalFindings: findings.length,
        asvsViolations: {},
        byChapter: {},
        byLevel: { 1: [], 2: [], 3: [] },
        complianceScore: 100,
        summary: []
    };

    // Count total requirements
    let totalReqs = 0;
    for (const chapter of Object.values(ASVS_REQUIREMENTS)) {
        totalReqs += Object.keys(chapter.requirements).length;
    }

    // Process each finding
    const violatedReqs = new Set();

    for (const finding of findings) {
        const claimType = finding.claim_type || finding.type;
        const asvsReqs = mapToASVS(claimType);

        for (const req of asvsReqs) {
            violatedReqs.add(req.id);

            // Track by chapter
            if (!report.byChapter[req.chapter]) {
                report.byChapter[req.chapter] = {
                    name: req.chapterName,
                    violations: []
                };
            }

            if (!report.byChapter[req.chapter].violations.find(v => v.id === req.id)) {
                report.byChapter[req.chapter].violations.push({
                    id: req.id,
                    description: req.description,
                    level: req.level,
                    findings: []
                });
            }

            // Add finding to violation
            const violation = report.byChapter[req.chapter].violations.find(v => v.id === req.id);
            violation.findings.push({
                type: claimType,
                subject: finding.subject,
                severity: finding.severity || finding.predicate?.severity
            });

            // Track by level
            if (!report.byLevel[req.level].includes(req.id)) {
                report.byLevel[req.level].push(req.id);
            }
        }
    }

    // Calculate compliance score
    report.violatedRequirements = violatedReqs.size;
    report.complianceScore = Math.round((1 - violatedReqs.size / totalReqs) * 100);

    // Generate summary
    if (violatedReqs.size === 0) {
        report.summary.push('No ASVS violations detected from current findings.');
    } else {
        report.summary.push(`${violatedReqs.size} ASVS requirements violated.`);

        // Most critical chapters
        const sortedChapters = Object.entries(report.byChapter)
            .sort((a, b) => b[1].violations.length - a[1].violations.length)
            .slice(0, 3);

        for (const [chapter, data] of sortedChapters) {
            report.summary.push(`${chapter} (${data.name}): ${data.violations.length} violations`);
        }
    }

    return report;
}

/**
 * Get ASVS remediation guidance for a claim type
 * @param {string} claimType - LSGv2 claim type
 * @returns {object[]} Remediation guidance
 */
export function getRemediationGuidance(claimType) {
    const asvsReqs = mapToASVS(claimType);

    return asvsReqs.map(req => ({
        requirement: req.id,
        description: req.description,
        guidance: `Implement controls to satisfy ASVS ${req.id}: ${req.description}`,
        reference: `https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/`
    }));
}

export default {
    ASVS_REQUIREMENTS,
    CLAIM_TO_ASVS_MAP,
    mapToASVS,
    generateComplianceReport,
    getRemediationGuidance
};
