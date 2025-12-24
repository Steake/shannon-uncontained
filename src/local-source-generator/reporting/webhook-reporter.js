/**
 * Webhook Reporter
 * 
 * Sends scan summaries to external webhooks (Slack, Discord, generic JSON).
 * Support simple payload transformation.
 */

import fetch from 'node-fetch';

export class WebhookReporter {
    constructor(options = {}) {
        this.webhookUrl = options.webhookUrl || process.env.SHANNON_WEBHOOK_URL;
        this.webhookType = options.webhookType || process.env.SHANNON_WEBHOOK_TYPE || 'generic'; // slack, discord, generic
    }

    async sendReport(report) {
        if (!this.webhookUrl) {
            console.log('No webhook URL configured. Skipping notification.');
            return;
        }

        try {
            const payload = this.formatPayload(report);

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
            }

            console.log(`Webhook notification sent to ${this.webhookType}`);
        } catch (error) {
            console.error('Failed to send webhook:', error.message);
        }
    }

    formatPayload(report) {
        const summary = report.summary;
        const target = report.target;
        const critical = summary.bySeverity.critical || 0;
        const high = summary.bySeverity.high || 0;

        if (this.webhookType === 'slack') {
            return {
                text: `🚨 Security Scan Complete: ${target}`,
                blocks: [
                    {
                        type: "header",
                        text: { type: "plain_text", text: `🛡️ Shannon Scan Report: ${target}` }
                    },
                    {
                        type: "section",
                        fields: [
                            { type: "mrkdwn", text: `*Target:*\n${target}` },
                            { type: "mrkdwn", text: `*Findings:*\nCritical: ${critical} | High: ${high}` }
                        ]
                    },
                    {
                        type: "section",
                        text: { type: "mrkdwn", text: `Total Findings: ${summary.totalFindings}` }
                    }
                ]
            };
        } else if (this.webhookType === 'discord') {
            return {
                content: `**Shannon Security Scan Completed**\nTarget: ${target}\n\n🔴 Critical: ${critical}\n🟠 High: ${high}\nTotal Findings: ${summary.totalFindings}`
            };
        } else {
            // Generic JSON
            return {
                event: 'scan_complete',
                target: target,
                timestamp: new Date().toISOString(),
                summary: summary
            };
        }
    }
}

export default WebhookReporter;
