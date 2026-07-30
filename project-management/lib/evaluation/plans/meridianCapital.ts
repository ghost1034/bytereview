import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 7 — Meridian Capital Partners (corp dev / M&A). */
export function meridianCapitalPlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Corp Dev', iconEmoji: '🤝' },
    { name: 'Integration Office', iconEmoji: '🔗' },
    { name: 'Tax', iconEmoji: '📋' },
    { name: 'Legal', iconEmoji: '⚖️' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@meridian.eval.tasklytic',
    workspace: {
      name: 'Meridian Capital Partners',
      iconEmoji: '🏛️',
      profile: { industry: 'Corporate Development' },
      psaMode: 'advisory',
    },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 10),
    projects: [
      { templateId: 'g1-strategic-acquisition', name: 'Project Falcon — Acquisition of Beacon Logistics', teamName: 'Corp Dev' },
      { templateId: 'g2-spinoff-divestiture', name: 'Project Helix — Spin-off of Crestwood Industrial', teamName: 'Corp Dev' },
    ],
    portfolios: [{ name: 'Active Transactions 2026', projectNames: ['Project Falcon — Acquisition of Beacon Logistics'] }],
    goals: [
      { name: 'Close Project Falcon by Q1 2027', metricCurrent: 48 },
      { name: 'Spin Project Helix tax-free by Q3 2027', metricCurrent: 35 },
    ],
    psa: { sampleTimeEntryCount: 20 },
    inboxWelcome: {
      title: 'Meridian eval tenant',
      body: 'M&A diligence with parent/child project linkage and risk registers.',
    },
  }
}
