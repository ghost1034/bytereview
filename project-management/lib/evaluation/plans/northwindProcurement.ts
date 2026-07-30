import type { ProvisioningPlan } from '../../provisioning/types'
import { buildEvalMembers } from '../people'

/** Tenant 5 — Northwind Industrial Procurement. */
export function northwindProcurementPlan(ownerId: string): ProvisioningPlan {
  const teams = [
    { name: 'Strategic Sourcing', iconEmoji: '🎯' },
    { name: 'Vendor Management', iconEmoji: '🤝' },
    { name: 'Contracts', iconEmoji: '📄' },
  ]
  return {
    mode: 'create',
    ownerId,
    ownerName: 'Eval Admin',
    ownerEmail: 'admin@northwind.eval.tasklytic',
    workspace: { name: 'Northwind Industrial — Procurement', iconEmoji: '🏭', profile: { industry: 'Procurement' } },
    teams,
    members: buildEvalMembers(teams.map((t) => t.name), 8),
    projects: [
      { templateId: 'e1-strategic-sourcing', name: 'ERP Replacement RFP', teamName: 'Strategic Sourcing' },
      { templateId: 'e2-vendor-onboarding', name: 'Vendor Onboarding Queue', teamName: 'Vendor Management' },
      { templateId: 'e3-contract-renewal', name: 'Contract Renewal Tracker FY2027', teamName: 'Contracts' },
    ],
    portfolios: [{ name: 'Top 25 Vendors', projectNames: ['Vendor Onboarding Queue'] }],
    goals: [
      { name: 'Savings target $4.2M', metricCurrent: 45 },
      { name: 'Critical vendor SOC 2 refresh on-time', metricTarget: 100, metricCurrent: 88 },
    ],
    inboxWelcome: { title: 'Northwind eval tenant', body: 'Procurement RFP, vendor onboarding, and renewals.' },
  }
}
