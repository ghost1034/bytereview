import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 2 — Sterling & Brooks CPA. */
export function sterlingBrooksPlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Tax', iconEmoji: '📋' },
    { name: 'Audit', iconEmoji: '🔍' },
    { name: 'Advisory', iconEmoji: '💡' },
    { name: 'Bookkeeping', iconEmoji: '📒' },
    { name: 'Administration', iconEmoji: '🏢' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@sterling.eval.tasklytic',
    workspace: {
      name: 'Sterling & Brooks CPA',
      iconEmoji: '🧾',
      profile: { industry: 'Accounting / CPA' },
      psaMode: 'accounting',
    },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 14),
    projects: [
      { templateId: 'b1-month-end-close', name: 'Acme Inc. — Month-End Close (October 2026)', teamName: 'Tax' },
      { templateId: 'b2-year-end-audit', name: 'Beacon Logistics — Year-End Close & Audit 2026', teamName: 'Audit' },
      { templateId: 'b3-form-1040', name: 'Lin Family — 1040 Tax Year 2025', teamName: 'Tax' },
      { templateId: 'b4-audit-engagement', name: 'Crestwood Health — FY2025 Audit', teamName: 'Audit' },
      { templateId: 'b5-cpa-client-onboarding', name: 'Riverstone Manufacturing — New Engagement', teamName: 'Advisory' },
    ],
    portfolios: [{ name: 'Tax Season 2026', projectNames: ['Lin Family — 1040 Tax Year 2025'] }],
    goals: [
      { name: 'Realization ≥ 95%', metricTarget: 95, metricCurrent: 88 },
      { name: 'Days-to-file < 12', metricTarget: 100, metricCurrent: 72 },
    ],
    psa: {
      rateCardName: 'Sterling & Brooks — Standard 2026',
      clients: [
        { name: 'Acme Inc.', industry: 'Manufacturing' },
        { name: 'Beacon Logistics', industry: 'Transportation' },
        { name: 'Lin Family', industry: 'Individual' },
        { name: 'Crestwood Health', industry: 'Healthcare' },
        { name: 'Riverstone Manufacturing', industry: 'Manufacturing' },
      ],
      sampleTimeEntryCount: 40,
    },
    inboxWelcome: { title: 'Sterling & Brooks eval tenant', body: 'CPA firm PSA and tax season workflows.' },
  }
}
