/**
 * E. Procurement templates (E1–E3).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

export const strategicSourcingTemplate = defineTemplate({
  id: 'e1-strategic-sourcing',
  name: 'Strategic Sourcing / RFP',
  description: 'RFP lifecycle from requirements through contract execution.',
  category: 'Procurement',
  iconEmoji: '📦',
  color: 'info',
  defaultView: 'gantt',
  sectionNames: ['Requirements gathering', 'RFP build', 'Vendor outreach', 'Vendor responses', 'Evaluation', 'Negotiation', 'Award', 'Contract execution'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Category', type: 'dropdown', options: enumOptions([{ label: 'IT/SaaS', color: 'blue' }, { label: 'Professional services', color: 'purple' }, { label: 'Marketing', color: 'rose' }, { label: 'Legal', color: 'indigo' }]) },
    { name: 'Estimated annual spend', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Expected savings %', type: 'number', numberFormat: 'percent' },
    { name: 'Recommendation', type: 'dropdown', options: enumOptions([{ label: 'Award', color: 'accent' }, { label: 'Reject', color: 'danger' }, { label: 'Shortlist', color: 'warning' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Business case', 'Functional requirements', 'Non-functional requirements', 'Commercial requirements', 'Evaluation scoring matrix'], { role: 'Sourcing' }),
    ...tasksInSection(1, ['Draft RFP document', 'Internal stakeholder review', 'Approve RFP', 'Identify vendor longlist'], { startDay: 7, role: 'Sourcing' }),
    ...tasksInSection(2, ['Send NDAs', 'Issue RFP', 'Pre-bid Q&A window', 'Respond to vendor questions'], { startDay: 14, role: 'Sourcing', milestoneAt: [1] }),
    ...tasksInSection(3, ['Receive vendor A response', 'Receive vendor B response', 'Receive vendor C response', 'Scoring per vendor'], { startDay: 28, role: 'Evaluation team' }),
    ...tasksInSection(4, ['Scoring calibration', 'Shortlist (3 vendors)', 'Demos / orals', 'Reference calls', 'Best & final offer'], { startDay: 35, role: 'Steering committee' }),
    ...tasksInSection(5, ['Commercial negotiation', 'Legal review of redlines', 'Risk acceptance memo'], { startDay: 42, role: 'Sourcing' }),
    ...tasksInSection(6, ['Recommendation memo', 'Steering committee decision', 'Notify winners & losers'], { startDay: 49, role: 'Sourcing', milestoneAt: [1] }),
    ...tasksInSection(7, ['Final contract', 'Sign', 'Onboard vendor'], { startDay: 56, role: 'Legal' }),
  ],
  ruleTemplates: [
    { name: 'Award spawns onboarding', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: 'award' }, conditions: [], actions: [{ type: 'add_to_project', projectId: 'vendor-onboarding' }], runCount: 0 },
    { name: 'CFO approval high spend', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'spend' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'CFO approval required' }], runCount: 0 },
  ],
  relatedTemplateIds: ['e2-vendor-onboarding', 'c3-contract-review'],
})

export const vendorOnboardingTemplate = defineTemplate({
  id: 'e2-vendor-onboarding',
  name: 'Vendor Onboarding & Risk',
  description: 'Vendor due diligence, approvals, and ERP setup.',
  category: 'Procurement',
  iconEmoji: '🏷️',
  color: 'teal',
  defaultView: 'list',
  sectionNames: ['Intake', 'Due diligence', 'Approvals', 'Setup', 'Active'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Vendor name', type: 'text' },
    { name: 'Spend tier', type: 'dropdown', options: enumOptions([{ label: 'Low (<$10K)', color: 'gray' }, { label: 'Medium', color: 'blue' }, { label: 'High', color: 'warning' }, { label: 'Critical (>$1M)', color: 'danger' }]) },
    { name: 'Data access', type: 'dropdown', options: enumOptions([{ label: 'None', color: 'gray' }, { label: 'Limited', color: 'blue' }, { label: 'Sensitive', color: 'warning' }, { label: 'Highly sensitive', color: 'danger' }]) },
    { name: 'Risk rating', type: 'dropdown', options: enumOptions([{ label: 'Low', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'High', color: 'danger' }, { label: 'Critical', color: 'danger' }]) },
    { name: 'W-9 / W-8 received?', type: 'checkbox' },
    { name: 'Insurance COI received?', type: 'checkbox' },
    { name: 'SOC 2 received?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Vendor intake form', 'Confirm sponsor & owner', 'Confirm spend tier & data access'], { role: 'Procurement' }),
    ...tasksInSection(1, ['Collect W-9/W-8', 'D&B lookup', 'Request COI', 'Verify policy limits', 'Security questionnaire', 'SOC 2 review', 'Privacy review (DPA)', 'OFAC screening', 'Customer references'], { startDay: 3, role: 'Risk' }),
    ...tasksInSection(2, ['Procurement approval', 'Legal approval', 'Security approval', 'Privacy approval', 'Finance approval'], { startDay: 10, role: 'Approvers' }),
    ...tasksInSection(3, ['Vendor master in ERP', 'Banking setup', 'Tax setup', 'PO process explained', 'Vendor portal access'], { startDay: 14, role: 'Procurement' }),
    ...tasksInSection(4, ['Ongoing risk monitoring', 'Annual COI refresh', 'Annual SOC 2 refresh'], { startDay: 21, role: 'Risk' }),
  ],
  ruleTemplates: [
    { name: 'Critical tier escalation', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'spend-tier' }, conditions: [{ field: 'spend-tier', op: 'eq', value: 'Critical (>$1M)' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Critical vendor — full DD required' }], runCount: 0 },
    { name: 'Unlock setup', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'setup' }], runCount: 0 },
  ],
})

export const contractRenewalTemplate = defineTemplate({
  id: 'e3-contract-renewal',
  name: 'Contract Renewal Management',
  description: 'Renewal pipeline by days-out window with example contracts.',
  category: 'Procurement',
  iconEmoji: '🔄',
  color: 'warning',
  defaultView: 'board',
  recurring: 'Ongoing',
  sectionNames: ['180 days out', '120 days out', '90 days out', '60 days out', '30 days out', 'Decision made', 'Renewed', 'Cancelled'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Vendor / Counterparty', type: 'text' },
    { name: 'Current annual cost', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Renewal date', type: 'date' },
    { name: 'Notice period (days)', type: 'number' },
    { name: 'Auto-renew?', type: 'checkbox' },
    { name: 'Decision', type: 'dropdown', options: enumOptions([{ label: 'Renew', color: 'accent' }, { label: 'Renegotiate', color: 'warning' }, { label: 'Replace', color: 'blue' }, { label: 'Terminate', color: 'danger' }]) },
    { name: 'Usage / value rating', type: 'dropdown', options: enumOptions([{ label: 'High', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'Low', color: 'gray' }]) },
  ],
  taskSpecs: [
    { name: 'Salesforce — Enterprise CRM', sectionIndex: 0, relativeDueDays: 150, notes: 'Annual $480K' },
    { name: 'AWS — Production accounts', sectionIndex: 2, relativeDueDays: 90, notes: 'Annual $1.2M' },
    { name: 'Office Lease — HQ', sectionIndex: 0, relativeDueDays: 200, notes: 'Annual $850K' },
    { name: 'Zoom — Enterprise', sectionIndex: 3, relativeDueDays: 60, notes: 'Annual $95K' },
    { name: 'Datadog — Observability', sectionIndex: 4, relativeDueDays: 30, notes: 'Annual $220K' },
    ...tasksInSection(5, ['Renewal decision workflow', 'Stakeholder survey template'], { role: 'Procurement' }),
  ],
  ruleTemplates: [
    { name: '30-day no decision', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: '30-days-out' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Renewal decision needed' }], runCount: 0 },
    { name: 'Replace triggers RFP', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'decision' }, conditions: [{ field: 'decision', op: 'eq', value: 'Replace' }], actions: [{ type: 'add_to_project', projectId: 'rfp' }], runCount: 0 },
  ],
  dashboardTemplates: [{ name: 'Renewals dashboard', charts: [{ title: 'Renewals by category', type: 'bar', source: 'tasks', filters: [], measure: 'count' }, { title: 'Quarter renewal value', type: 'number', source: 'tasks', filters: [], measure: 'sum' }], layout: [] }],
})

export const PROCUREMENT_TEMPLATES: CuratedProjectTemplate[] = [
  strategicSourcingTemplate,
  vendorOnboardingTemplate,
  contractRenewalTemplate,
]
