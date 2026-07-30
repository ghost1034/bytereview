import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 1 — Atlas Studio (digital product agency). */
export function atlasStudioPlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Design', iconEmoji: '🎨' },
    { name: 'Engineering', iconEmoji: '⚙️' },
    { name: 'Marketing', iconEmoji: '📣' },
    { name: 'Operations', iconEmoji: '🏢' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@atlas.eval.tasklytic',
    workspace: { name: 'Atlas Studio', iconEmoji: '🎬', profile: { industry: 'Agency' } },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 12),
    projects: [
      { templateId: 'curated-engineering-sprint', name: 'Acme Mobile App Redesign', teamName: 'Engineering', defaultView: 'timeline' },
      { templateId: 'a1-qbr', name: 'Q3 2026 QBR', teamName: 'Marketing' },
      { templateId: 'a2-b2b-onboarding', name: 'Beacon Customer Onboarding', teamName: 'Operations' },
      { templateId: 'a3-sales-pipeline', name: 'Atlas Sales Pipeline', teamName: 'Marketing' },
      { templateId: 'a4-strategic-planning', name: 'Atlas 2026 Strategic Plan', teamName: 'Operations' },
    ],
    portfolios: [{ name: 'Client Work Q3', projectNames: ['Acme Mobile App Redesign', 'Beacon Customer Onboarding'] }],
    goals: [
      { name: 'Ship Acme redesign beta', metricCurrent: 55 },
      { name: 'Improve QBR prep cycle time', metricCurrent: 40 },
      { name: 'Grow pipeline coverage', metricCurrent: 62 },
    ],
    inboxWelcome: { title: 'Atlas Studio eval tenant', body: 'Explore agency workflows with sample projects.' },
  }
}
