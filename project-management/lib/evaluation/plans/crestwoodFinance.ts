import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 4 — Crestwood Holdings Finance. */
export function crestwoodFinancePlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'FP&A', iconEmoji: '📊' },
    { name: 'Accounting', iconEmoji: '📒' },
    { name: 'Treasury', iconEmoji: '💰' },
    { name: 'Tax', iconEmoji: '📋' },
    { name: 'Investor Relations', iconEmoji: '📈' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@crestwood.eval.tasklytic',
    workspace: { name: 'Crestwood Holdings — Finance', iconEmoji: '🏦', profile: { industry: 'Finance' } },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 12),
    projects: [
      { templateId: 'd2-fpa-close', name: 'Monthly Close & Reporting (October 2026)', teamName: 'Accounting' },
      { templateId: 'd1-annual-budget', name: 'FY2027 Annual Budget', teamName: 'FP&A' },
      { templateId: 'd3-sox-404', name: 'SOX 404 Q4 Testing Cycle', teamName: 'Accounting' },
      { templateId: 'd4-sec-reporting', name: 'Q3 2026 10-Q Filing', teamName: 'Investor Relations' },
    ],
    portfolios: [{ name: 'Crestwood Finance Q4', projectNames: ['Monthly Close & Reporting (October 2026)'] }],
    goals: [
      { name: 'Days-to-close ≤ 5', metricCurrent: 70 },
      { name: '% SOX controls effective', metricTarget: 100, metricCurrent: 92 },
      { name: 'Forecast accuracy', metricCurrent: 85 },
    ],
    inboxWelcome: { title: 'Crestwood Finance eval tenant', body: 'Public-company close, SOX, and SEC reporting.' },
  }
}
