/**
 * Report Generator
 * 
 * Generates structured reports in JSON, HTML, and SARIF formats
 * for enterprise integration and compliance.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * OWASP Top 10 2021 mapping
 */
const OWASP_TOP_10 = {
    'A01:2021': { name: 'Broken Access Control', vulnClasses: ['IDOR', 'AuthBypass', 'PathTraversal'] },
    'A02:2021': { name: 'Cryptographic Failures', vulnClasses: ['WeakCrypto', 'DataExposure'] },
    'A03:2021': { name: 'Injection', vulnClasses: ['SQLi', 'CommandInjection', 'XSS', 'SSTI'] },
    'A04:2021': { name: 'Insecure Design', vulnClasses: ['BusinessLogic', 'MissingAuth'] },
    'A05:2021': { name: 'Security Misconfiguration', vulnClasses: ['CORS', 'DebugEnabled', 'DefaultCreds'] },
    'A06:2021': { name: 'Vulnerable Components', vulnClasses: ['OutdatedDeps', 'KnownCVE'] },
    'A07:2021': { name: 'Auth Failures', vulnClasses: ['WeakPassword', 'SessionFixation', 'BruteForce'] },
    'A08:2021': { name: 'Software/Data Integrity', vulnClasses: ['InsecureDeserial', 'CodeInjection'] },
    'A09:2021': { name: 'Logging Failures', vulnClasses: ['InsufficientLogging'] },
    'A10:2021': { name: 'SSRF', vulnClasses: ['SSRF'] }
};

import CvssCalculator from './cvss-calculator.js';

/**
 * Map vulnerability class to OWASP category
 */
function mapToOWASP(vulnClass) {
    for (const [id, data] of Object.entries(OWASP_TOP_10)) {
        if (data.vulnClasses.some(v => vulnClass.toLowerCase().includes(v.toLowerCase()))) {
            return { id, name: data.name };
        }
    }
    return null;
}

/**
 * Generate JSON report
 * 
 * @param {Object} findings - All scan findings
 * @param {Object} metadata - Scan metadata
 * @returns {Object} - Structured JSON report
 */
export function generateJSONReport(findings, metadata = {}) {
    const report = {
        version: '1.0.0',
        generator: 'Shannon LSG',
        scanTime: new Date().toISOString(),
        target: metadata.target || 'unknown',
        duration: metadata.duration || null,
        summary: {
            totalFindings: 0,
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            byCategory: {}
        },
        findings: [],
        metadata: {
            ...metadata,
            owaspMapping: true,
            pciDssMapping: true,
            cvssScoring: true
        }
    };

    // Process vulnerability findings
    if (findings.vulnerabilities) {
        for (const [severity, vulns] of Object.entries(findings.vulnerabilities)) {
            if (Array.isArray(vulns)) {
                for (const vuln of vulns) {
                    const owasp = mapToOWASP(vuln.vulnerabilityClass || '');

                    // Calculate CVSS if vector provided, otherwise estimate
                    let cvss = { score: 0, vector: '' };
                    try {
                        if (vuln.cvssVector) {
                            cvss = CvssCalculator.calculateScore(vuln.cvssVector);
                        } else {
                            // Default estimation based on severity
                            const vectors = {
                                critical: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', // 9.8
                                high: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',     // 7.5
                                medium: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',   // 6.1
                                low: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N'       // 4.3
                            };
                            cvss = CvssCalculator.calculateScore(vectors[severity] || vectors.low);
                        }
                    } catch (e) {
                        console.error('CVSS calc error:', e);
                    }

                    report.findings.push({
                        id: vuln.id || `FINDING-${report.findings.length + 1}`,
                        title: vuln.vulnerabilityClass || 'Unknown',
                        severity: severity,
                        cvss: cvss,
                        endpoint: vuln.endpoint,
                        parameter: vuln.matchedParams?.join(', ') || '',
                        description: vuln.description || `Potential ${vuln.vulnerabilityClass} vulnerability`,
                        owasp: owasp,
                        exploitHints: vuln.exploitHints || [],
                        evidence: vuln.evidence || null,
                        remediation: vuln.remediation || null // Includes patch if available
                    });

                    report.summary.bySeverity[severity] = (report.summary.bySeverity[severity] || 0) + 1;
                    const category = vuln.vulnerabilityClass || 'Other';
                    report.summary.byCategory[category] = (report.summary.byCategory[category] || 0) + 1;
                }
            }
        }
    }

    // Process misconfigurations
    if (findings.misconfigurations) {
        for (const misconfig of findings.misconfigurations.godModeParams || []) {
            report.findings.push({
                id: `MISCONFIG-${report.findings.length + 1}`,
                title: 'Debug/Admin Parameter',
                severity: 'medium',
                endpoint: misconfig.endpoint,
                parameter: misconfig.param,
                description: misconfig.description,
                owasp: { id: 'A05:2021', name: 'Security Misconfiguration' }
            });
            report.summary.bySeverity.medium++;
        }

        for (const secret of findings.misconfigurations.secrets || []) {
            report.findings.push({
                id: `SECRET-${report.findings.length + 1}`,
                title: `Hardcoded ${secret.type}`,
                severity: 'critical',
                file: secret.file,
                description: `Potential hardcoded secret of type: ${secret.type}`,
                owasp: { id: 'A02:2021', name: 'Cryptographic Failures' }
            });
            report.summary.bySeverity.critical++;
        }
    }

    report.summary.totalFindings = report.findings.length;

    return report;
}

/**
 * Generate SARIF report for GitHub Security
 * 
 * @param {Object} findings - All scan findings
 * @param {Object} metadata - Scan metadata
 * @returns {Object} - SARIF 2.1.0 report
 */
export function generateSARIFReport(findings, metadata = {}) {
    const jsonReport = generateJSONReport(findings, metadata);

    const sarif = {
        '$schema': 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [{
            tool: {
                driver: {
                    name: 'Shannon LSG',
                    version: '1.0.0',
                    informationUri: 'https://github.com/Steake/shannon',
                    rules: []
                }
            },
            results: []
        }]
    };

    const rulesMap = new Map();

    for (const finding of jsonReport.findings) {
        // Add rule if not exists
        if (!rulesMap.has(finding.title)) {
            const ruleIndex = rulesMap.size;
            rulesMap.set(finding.title, ruleIndex);

            sarif.runs[0].tool.driver.rules.push({
                id: finding.title.replace(/\s+/g, '-').toLowerCase(),
                name: finding.title,
                shortDescription: { text: finding.title },
                fullDescription: { text: finding.description || finding.title },
                helpUri: finding.owasp ? `https://owasp.org/Top10/${finding.owasp.id}/` : undefined,
                properties: {
                    'security-severity': severityToScore(finding.severity)
                }
            });
        }

        // Add result
        sarif.runs[0].results.push({
            ruleId: finding.title.replace(/\s+/g, '-').toLowerCase(),
            ruleIndex: rulesMap.get(finding.title),
            level: severityToSARIFLevel(finding.severity),
            message: {
                text: finding.description || `${finding.title} found at ${finding.endpoint || finding.file || 'unknown location'}`
            },
            locations: [{
                physicalLocation: {
                    artifactLocation: {
                        uri: finding.endpoint || finding.file || 'unknown',
                        uriBaseId: '%SRCROOT%'
                    }
                }
            }],
            properties: {
                owasp: finding.owasp?.id
            }
        });
    }

    return sarif;
}

/**
 * Generate HTML report
 * 
 * @param {Object} findings - All scan findings
 * @param {Object} metadata - Scan metadata
 * @returns {string} - HTML report
 */
export function generateHTMLReport(findings, metadata = {}) {
    const jsonReport = generateJSONReport(findings, metadata);

    const severityColors = {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#ca8a04',
        low: '#16a34a'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shannon Security Scan Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 2rem; border-radius: 12px; margin-bottom: 2rem; }
        h1 { font-size: 2rem; color: #f8fafc; margin-bottom: 0.5rem; }
        .subtitle { color: #94a3b8; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: #1e293b; padding: 1.5rem; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2.5rem; font-weight: bold; }
        .stat-label { color: #94a3b8; font-size: 0.875rem; text-transform: uppercase; }
        .findings { background: #1e293b; border-radius: 12px; overflow: hidden; }
        .finding { padding: 1.5rem; border-bottom: 1px solid #334155; }
        .finding:last-child { border-bottom: none; }
        .finding-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
        .severity-badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .finding-title { font-size: 1.125rem; font-weight: 600; }
        .finding-meta { color: #94a3b8; font-size: 0.875rem; }
        .finding-desc { margin-top: 0.5rem; color: #cbd5e1; }
        .owasp-tag { display: inline-block; background: #3b82f6; color: white; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-top: 0.5rem; }
        footer { text-align: center; padding: 2rem; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🔐 Shannon Security Scan Report</h1>
            <p class="subtitle">Target: ${jsonReport.target} | Scan Time: ${jsonReport.scanTime}</p>
        </header>
        
        <div class="summary">
            <div class="stat-card">
                <div class="stat-value">${jsonReport.summary.totalFindings}</div>
                <div class="stat-label">Total Findings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${severityColors.critical}">${jsonReport.summary.bySeverity.critical}</div>
                <div class="stat-label">Critical</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${severityColors.high}">${jsonReport.summary.bySeverity.high}</div>
                <div class="stat-label">High</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${severityColors.medium}">${jsonReport.summary.bySeverity.medium}</div>
                <div class="stat-label">Medium</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: ${severityColors.low}">${jsonReport.summary.bySeverity.low}</div>
                <div class="stat-label">Low</div>
            </div>
        </div>

        <div class="findings">
            ${jsonReport.findings.map(f => `
                <div class="finding">
                    <div class="finding-header">
                        <span class="severity-badge" style="background: ${severityColors[f.severity]}">${f.severity}</span>
                        <span class="finding-title">${escapeHtml(f.title)}</span>
                    </div>
                    <div class="finding-meta">
                        ${f.endpoint ? `Endpoint: <code>${escapeHtml(f.endpoint)}</code>` : ''}
                        ${f.parameter ? ` | Parameter: <code>${escapeHtml(f.parameter)}</code>` : ''}
                        ${f.file ? `File: <code>${escapeHtml(f.file)}</code>` : ''}
                    </div>
                    <div class="finding-desc">${escapeHtml(f.description || '')}</div>
                    ${f.owasp ? `<span class="owasp-tag">${f.owasp.id}: ${f.owasp.name}</span>` : ''}
                </div>
            `).join('')}
            ${jsonReport.findings.length === 0 ? '<div class="finding"><p>No vulnerabilities found. 🎉</p></div>' : ''}
        </div>

        <footer>
            <p>Generated by Shannon Uncontained LSG v1.0.0</p>
        </footer>
    </div>
</body>
</html>`;
}

/**
 * Write all report formats to disk
 * 
 * @param {Object} findings - All scan findings
 * @param {string} outputDir - Output directory
 * @param {Object} metadata - Scan metadata
 */
export async function writeReports(findings, outputDir, metadata = {}) {
    await fs.mkdir(outputDir, { recursive: true });

    const jsonReport = generateJSONReport(findings, metadata);
    const sarifReport = generateSARIFReport(findings, metadata);
    const htmlReport = generateHTMLReport(findings, metadata);

    await fs.writeFile(
        path.join(outputDir, 'report.json'),
        JSON.stringify(jsonReport, null, 2)
    );

    await fs.writeFile(
        path.join(outputDir, 'shannon-results.sarif'),
        JSON.stringify(sarifReport, null, 2)
    );

    await fs.writeFile(
        path.join(outputDir, 'report.html'),
        htmlReport
    );

    return {
        json: path.join(outputDir, 'report.json'),
        sarif: path.join(outputDir, 'shannon-results.sarif'),
        html: path.join(outputDir, 'report.html')
    };
}

// Helper functions

function severityToScore(severity) {
    const scores = { critical: '9.0', high: '7.0', medium: '4.0', low: '1.0' };
    return scores[severity] || '0.0';
}

function severityToSARIFLevel(severity) {
    const levels = { critical: 'error', high: 'error', medium: 'warning', low: 'note' };
    return levels[severity] || 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export { OWASP_TOP_10, mapToOWASP };
