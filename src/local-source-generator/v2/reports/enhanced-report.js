/**
 * Enhanced Report Generator for LSGv2
 * 
 * Generates comprehensive security reports with:
 * - EBSL confidence scores for each finding
 * - Evidence chains showing proof of concept
 * - OWASP ASVS compliance mapping
 * - Exploitation results from validation agents
 */

import { generateComplianceReport, mapToASVS } from '../compliance/asvs-mapper.js';

/**
 * Report severity levels
 */
export const SEVERITY_LEVELS = {
    CRITICAL: { value: 4, color: '#dc2626', label: 'Critical' },
    HIGH: { value: 3, color: '#ea580c', label: 'High' },
    MEDIUM: { value: 2, color: '#ca8a04', label: 'Medium' },
    LOW: { value: 1, color: '#16a34a', label: 'Low' },
    INFO: { value: 0, color: '#3b82f6', label: 'Info' }
};

/**
 * Enhanced finding with EBSL and evidence chain
 */
export class EnhancedFinding {
    constructor(claim, ledger, evidenceGraph) {
        this.claim = claim;
        this.ledger = ledger;
        this.evidenceGraph = evidenceGraph;

        this.id = claim.id;
        this.type = claim.claim_type;
        this.subject = claim.subject;
        this.predicate = claim.predicate;
        this.severity = this.normalizeSeverity(claim.predicate?.severity);

        // Calculate EBSL opinion
        this.ebslOpinion = this.calculateOpinion();
        this.confidence = this.ebslOpinion.belief;
        this.uncertainty = this.ebslOpinion.uncertainty;

        // Build evidence chain
        this.evidenceChain = this.buildEvidenceChain();

        // Get ASVS mapping
        this.asvsRequirements = mapToASVS(this.type);
    }

    normalizeSeverity(severity) {
        if (!severity) return 'MEDIUM';
        const s = String(severity).toUpperCase();
        if (SEVERITY_LEVELS[s]) return s;
        return 'MEDIUM';
    }

    calculateOpinion() {
        try {
            const opinion = this.ledger.getClaimOpinion(this.id);
            if (opinion) return opinion;
        } catch { }

        // Default opinion if not in ledger
        return {
            belief: 0.5,
            disbelief: 0.1,
            uncertainty: 0.4,
            baseRate: 0.1
        };
    }

    buildEvidenceChain() {
        const chain = [];

        try {
            // Get evidence from ledger
            const claimEvidence = this.ledger.getClaimEvidence?.(this.id) || [];

            for (const ev of claimEvidence) {
                chain.push({
                    type: ev.dimension || ev.type,
                    source: ev.source,
                    weight: ev.weight,
                    timestamp: ev.timestamp
                });
            }

            // Get raw evidence from evidence graph
            const linkedEvents = this.evidenceGraph.getEventsForClaim?.(this.id) || [];

            for (const event of linkedEvents) {
                if (!chain.find(e => e.source === event.source)) {
                    chain.push({
                        type: event.type,
                        source: event.source,
                        data: event.payload,
                        timestamp: event.timestamp
                    });
                }
            }
        } catch { }

        return chain;
    }

    /**
     * Get confidence label
     */
    getConfidenceLabel() {
        if (this.confidence >= 0.9) return 'Confirmed';
        if (this.confidence >= 0.7) return 'High Confidence';
        if (this.confidence >= 0.5) return 'Medium Confidence';
        if (this.confidence >= 0.3) return 'Low Confidence';
        return 'Hypothesis';
    }

    /**
     * Get proof of concept if available
     */
    getPoC() {
        const pocTypes = ['xss_confirmed', 'sqli_confirmed', 'cmdi_confirmed', 'nuclei_finding'];

        for (const ev of this.evidenceChain) {
            if (pocTypes.includes(ev.type)) {
                return {
                    type: ev.type,
                    payload: ev.data?.payload,
                    url: ev.data?.url,
                    response: ev.data?.response?.substring?.(0, 500)
                };
            }
        }

        return null;
    }

    /**
     * Convert to JSON for report
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            subject: this.subject,
            severity: this.severity,
            confidence: Math.round(this.confidence * 100) + '%',
            confidenceLabel: this.getConfidenceLabel(),
            predicate: this.predicate,
            ebsl: {
                belief: this.ebslOpinion.belief,
                disbelief: this.ebslOpinion.disbelief,
                uncertainty: this.ebslOpinion.uncertainty
            },
            evidenceCount: this.evidenceChain.length,
            evidence: this.evidenceChain,
            poc: this.getPoC(),
            asvsMapping: this.asvsRequirements
        };
    }
}

/**
 * Generate enhanced security report
 */
export function generateEnhancedReport(ctx, options = {}) {
    const { format = 'json', includeEvidence = true } = options;

    const claims = ctx.ledger.getAllClaims?.() || [];
    const findings = [];

    // Convert claims to enhanced findings
    for (const claim of claims) {
        const finding = new EnhancedFinding(claim, ctx.ledger, ctx.evidenceGraph);
        findings.push(finding);
    }

    // Sort by severity then confidence
    findings.sort((a, b) => {
        const sevDiff = SEVERITY_LEVELS[b.severity].value - SEVERITY_LEVELS[a.severity].value;
        if (sevDiff !== 0) return sevDiff;
        return b.confidence - a.confidence;
    });

    // Build report
    const report = {
        metadata: {
            generatedAt: new Date().toISOString(),
            target: ctx.targetModel?.target || 'unknown',
            version: '2.0.0',
            totalFindings: findings.length
        },

        summary: {
            bySeverity: {
                critical: findings.filter(f => f.severity === 'CRITICAL').length,
                high: findings.filter(f => f.severity === 'HIGH').length,
                medium: findings.filter(f => f.severity === 'MEDIUM').length,
                low: findings.filter(f => f.severity === 'LOW').length,
                info: findings.filter(f => f.severity === 'INFO').length
            },
            byConfidence: {
                confirmed: findings.filter(f => f.confidence >= 0.9).length,
                highConfidence: findings.filter(f => f.confidence >= 0.7 && f.confidence < 0.9).length,
                hypothesis: findings.filter(f => f.confidence < 0.7).length
            },
            averageConfidence: findings.length > 0
                ? Math.round((findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length) * 100) + '%'
                : 'N/A'
        },

        findings: includeEvidence
            ? findings.map(f => f.toJSON())
            : findings.map(f => ({
                id: f.id,
                type: f.type,
                subject: f.subject,
                severity: f.severity,
                confidence: Math.round(f.confidence * 100) + '%'
            })),

        compliance: generateComplianceReport(findings.map(f => f.claim))
    };

    // Generate format-specific output
    if (format === 'json') {
        return JSON.stringify(report, null, 2);
    }

    if (format === 'markdown') {
        return generateMarkdownReport(report);
    }

    if (format === 'html') {
        return generateHTMLReport(report);
    }

    return report;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report) {
    let md = `# Security Assessment Report

**Target:** ${report.metadata.target}  
**Generated:** ${report.metadata.generatedAt}  
**Total Findings:** ${report.metadata.totalFindings}

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${report.summary.bySeverity.critical} |
| 🟠 High | ${report.summary.bySeverity.high} |
| 🟡 Medium | ${report.summary.bySeverity.medium} |
| 🟢 Low | ${report.summary.bySeverity.low} |
| 🔵 Info | ${report.summary.bySeverity.info} |

**Confirmed Findings:** ${report.summary.byConfidence.confirmed}  
**Average Confidence:** ${report.summary.averageConfidence}

---

## Findings

`;

    for (const finding of report.findings) {
        const severityEmoji = {
            CRITICAL: '🔴',
            HIGH: '🟠',
            MEDIUM: '🟡',
            LOW: '🟢',
            INFO: '🔵'
        }[finding.severity] || '⚪';

        md += `### ${severityEmoji} ${finding.type} (${finding.confidence})

**Subject:** \`${finding.subject}\`  
**Confidence:** ${finding.confidenceLabel}

`;

        if (finding.poc) {
            md += `**Proof of Concept:**
\`\`\`
${finding.poc.payload || finding.poc.url || 'Available'}
\`\`\`

`;
        }

        if (finding.asvsMapping?.length > 0) {
            md += `**ASVS Violations:** ${finding.asvsMapping.map(r => r.id).join(', ')}

`;
        }

        md += `---

`;
    }

    // Add compliance section
    if (report.compliance.violatedRequirements > 0) {
        md += `## OWASP ASVS Compliance

**Compliance Score:** ${report.compliance.complianceScore}%  
**Violated Requirements:** ${report.compliance.violatedRequirements}

${report.compliance.summary.join('  \n')}
`;
    }

    return md;
}

/**
 * Generate HTML report
 */
function generateHTMLReport(report) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Assessment - ${report.metadata.target}</title>
    <style>
        :root {
            --critical: #dc2626;
            --high: #ea580c;
            --medium: #ca8a04;
            --low: #16a34a;
            --info: #3b82f6;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background: #f8fafc;
        }
        h1 { color: #1e293b; }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin: 2rem 0;
        }
        .stat-card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value { font-size: 2rem; font-weight: bold; }
        .finding {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin: 1rem 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border-left: 4px solid var(--medium);
        }
        .finding.CRITICAL { border-left-color: var(--critical); }
        .finding.HIGH { border-left-color: var(--high); }
        .finding.MEDIUM { border-left-color: var(--medium); }
        .finding.LOW { border-left-color: var(--low); }
        .finding.INFO { border-left-color: var(--info); }
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 500;
        }
        .severity-CRITICAL { background: #fef2f2; color: var(--critical); }
        .severity-HIGH { background: #fff7ed; color: var(--high); }
        .severity-MEDIUM { background: #fefce8; color: var(--medium); }
        .severity-LOW { background: #f0fdf4; color: var(--low); }
        code { background: #e2e8f0; padding: 0.25rem 0.5rem; border-radius: 4px; }
        .confidence-bar {
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 0.5rem;
        }
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #10b981);
        }
    </style>
</head>
<body>
    <h1>🔒 Security Assessment Report</h1>
    <p><strong>Target:</strong> ${report.metadata.target}</p>
    <p><strong>Generated:</strong> ${report.metadata.generatedAt}</p>
    
    <div class="summary-grid">
        <div class="stat-card">
            <div class="stat-value" style="color: var(--critical)">${report.summary.bySeverity.critical}</div>
            <div>Critical</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--high)">${report.summary.bySeverity.high}</div>
            <div>High</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--medium)">${report.summary.bySeverity.medium}</div>
            <div>Medium</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--low)">${report.summary.bySeverity.low}</div>
            <div>Low</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${report.summary.byConfidence.confirmed}</div>
            <div>Confirmed</div>
        </div>
    </div>
    
    <h2>Findings</h2>
    ${report.findings.map(f => `
    <div class="finding ${f.severity}">
        <h3>
            <span class="badge severity-${f.severity}">${f.severity}</span>
            ${f.type}
        </h3>
        <p><strong>Subject:</strong> <code>${f.subject}</code></p>
        <p><strong>Confidence:</strong> ${f.confidenceLabel} (${f.confidence})</p>
        <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${f.confidence}"></div>
        </div>
        ${f.poc ? `<p><strong>PoC Available:</strong> ✅</p>` : ''}
        ${f.asvsMapping?.length > 0 ? `<p><strong>ASVS:</strong> ${f.asvsMapping.map(r => r.id).join(', ')}</p>` : ''}
    </div>
    `).join('')}
    
    <h2>OWASP ASVS Compliance</h2>
    <p><strong>Score:</strong> ${report.compliance.complianceScore}%</p>
    <p><strong>Violated Requirements:</strong> ${report.compliance.violatedRequirements}</p>
</body>
</html>`;
}

export default {
    EnhancedFinding,
    generateEnhancedReport,
    SEVERITY_LEVELS
};
