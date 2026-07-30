/**
 * Queue dashboard digest emails via EmailAdapter (V1: local pending queue).
 * Production: swap getEmailAdapter() for SES/SendGrid/Resend implementation.
 */
import { getEmailAdapter } from '../email'
import type { ReportingDashboard } from './types'

/** Queue a digest summarizing dashboard charts for each recipient. */
export async function queueDashboardDigest(dashboard: ReportingDashboard, recipients: string[]): Promise<void> {
  const adapter = getEmailAdapter()
  const chartLines = dashboard.charts.map((c) => `• ${c.title} (${c.type})`).join('\n')
  const bodyText = [
    `Dashboard digest: ${dashboard.name}`,
    '',
    chartLines || 'No charts configured.',
    '',
    '— Sent by CPAAutomation AI Productivity Suite Reporting.',
  ].join('\n')

  await adapter.send({
    to: recipients,
    subject: `[Tasklytic] Dashboard digest — ${dashboard.name}`,
    bodyHtml: bodyText.replace(/\n/g, '<br/>'),
    bodyText,
    workspaceId: dashboard.workspaceId,
    category: 'other',
    metadata: { dashboardId: dashboard.id, kind: 'dashboard_digest' },
  })
}
