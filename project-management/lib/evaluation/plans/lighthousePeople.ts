import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 6 — Lighthouse People Co. (HR). */
export function lighthousePeoplePlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Talent Acquisition', iconEmoji: '🎯' },
    { name: 'People Operations', iconEmoji: '👥' },
    { name: 'Total Rewards', iconEmoji: '💎' },
    { name: 'L&D', iconEmoji: '📚' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@lighthouse.eval.tasklytic',
    workspace: { name: 'Lighthouse People Co.', iconEmoji: '🏮', profile: { industry: 'HR / People' } },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 8),
    projects: [
      { templateId: 'f1-talent-acquisition', name: 'Q4 2026 Hiring', teamName: 'Talent Acquisition' },
      { templateId: 'f2-new-hire-onboarding', name: 'New Hire Onboarding (Active Cohort)', teamName: 'People Operations' },
      { templateId: 'f3-performance-review', name: 'H2 2026 Performance Review Cycle', teamName: 'People Operations' },
      { templateId: 'f4-open-enrollment', name: '2027 Open Enrollment', teamName: 'Total Rewards' },
    ],
    portfolios: [{ name: 'People Programs 2026', projectNames: ['Q4 2026 Hiring'] }],
    goals: [
      { name: 'Time-to-fill ≤ 35 days', metricCurrent: 78 },
      { name: '90-day retention ≥ 95%', metricTarget: 95, metricCurrent: 91 },
      { name: 'OE participation ≥ 92%', metricTarget: 92, metricCurrent: 86 },
    ],
    inboxWelcome: { title: 'Lighthouse eval tenant', body: 'HR hiring, onboarding, and review cycles.' },
  }
}
