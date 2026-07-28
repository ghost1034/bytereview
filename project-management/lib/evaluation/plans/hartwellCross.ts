import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 3 — Hartwell & Cross LLP (boutique law firm). */
export function hartwellCrossPlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Litigation', iconEmoji: '⚖️' },
    { name: 'Corporate', iconEmoji: '🏛️' },
    { name: 'M&A', iconEmoji: '🤝' },
    { name: 'Employment', iconEmoji: '👥' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@hartwell.eval.tasklytic',
    workspace: {
      name: 'Hartwell & Cross LLP',
      iconEmoji: '⚖️',
      profile: { industry: 'Law firm' },
      psaMode: 'legal',
    },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 10),
    projects: [
      { templateId: 'c2-litigation', name: 'Doe v. Acme Manufacturing', teamName: 'Litigation' },
      { templateId: 'c4-ma-closing', name: 'Smith Industries — Acquisition of Beacon Logistics', teamName: 'M&A' },
      { templateId: 'c1-matter-intake', name: 'Hartwell — New Matter Intake (Q4)', teamName: 'Corporate' },
      { templateId: 'c3-contract-review', name: 'Hartwell — Active Contract Reviews', teamName: 'Corporate' },
    ],
    portfolios: [{ name: 'Active Matters Q4 2026', projectNames: ['Doe v. Acme Manufacturing'] }],
    goals: [
      { name: 'Conflict checks < 24h', metricCurrent: 80 },
      { name: 'Billable utilization ≥ 65%', metricTarget: 65, metricCurrent: 58 },
    ],
    psa: {
      rateCardName: 'Hartwell — Standard 2026',
      sampleTimeEntryCount: 30,
      clients: [
        { name: 'Doe Family Trust', industry: 'Litigation' },
        { name: 'Smith Industries', industry: 'M&A' },
        { name: 'Beacon Logistics', industry: 'Corporate' },
      ],
    },
    inboxWelcome: { title: 'Hartwell eval tenant', body: 'Litigation and matter management with UTBMS time codes.' },
  }
}
