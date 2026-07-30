/**
 * A. General Business industry templates (A1–A4).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

const qbrSections = [
  'Pre-QBR (Data gathering)',
  'Build (Narrative & deck)',
  'Internal review',
  'Customer / Executive review',
  'Follow-ups',
]

/** Quarterly Business Review — executive cadence from data pull through follow-ups. */
export const qbrTemplate = defineTemplate({
  id: 'a1-qbr',
  name: 'Quarterly Business Review (QBR)',
  description: 'Plan, build, and deliver a cross-functional QBR with executive review.',
  category: 'Business',
  iconEmoji: '📊',
  color: 'primary',
  defaultView: 'list',
  suggestedBundles: ['Status field', 'Priority field'],
  sectionNames: qbrSections,
  customFieldIds: [],
  recommendedFields: [
    { name: 'Workstream', type: 'dropdown', options: enumOptions([{ label: 'Sales', color: 'blue' }, { label: 'Product', color: 'purple' }, { label: 'CS', color: 'teal' }, { label: 'Finance', color: 'amber' }, { label: 'Marketing', color: 'rose' }]) },
    { name: 'Confidence', type: 'dropdown', options: enumOptions([{ label: 'High', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'Low', color: 'danger' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    { name: 'Lock metrics scope with CRO', sectionIndex: 0, relativeDueDays: 0, assigneeRole: 'PMO' },
    { name: 'Pull pipeline, ARR, churn, NRR from CRM', sectionIndex: 0, relativeDueDays: 1, assigneeRole: 'RevOps' },
    { name: 'Pull product usage trends', sectionIndex: 0, relativeDueDays: 1, assigneeRole: 'Product Ops' },
    { name: 'Compile NPS / CSAT', sectionIndex: 0, relativeDueDays: 2, assigneeRole: 'CS Ops' },
    { name: 'Update competitive intel', sectionIndex: 0, relativeDueDays: 2, assigneeRole: 'PMM' },
    { name: 'Draft narrative outline', sectionIndex: 1, relativeDueDays: 3, assigneeRole: 'Chief of Staff' },
    { name: 'Build slides — Wins & misses', sectionIndex: 1, relativeDueDays: 5, assigneeRole: 'Strategy' },
    { name: 'Build slides — Forward look', sectionIndex: 1, relativeDueDays: 5, assigneeRole: 'Strategy' },
    { name: 'Insert metrics & charts', sectionIndex: 1, relativeDueDays: 6, assigneeRole: 'Strategy' },
    { name: 'Dry run with leadership', sectionIndex: 2, relativeDueDays: 8, assigneeRole: 'All execs', milestone: true },
    { name: 'Incorporate feedback', sectionIndex: 2, relativeDueDays: 9, assigneeRole: 'Chief of Staff' },
    { name: 'Send pre-read to attendees', sectionIndex: 3, relativeDueDays: 10, assigneeRole: 'EA' },
    { name: 'Run QBR meeting', sectionIndex: 3, relativeDueDays: 12, assigneeRole: 'Account exec', milestone: true },
    { name: 'Capture action items', sectionIndex: 3, relativeDueDays: 12, assigneeRole: 'Note-taker' },
    { name: 'Distribute deck & recap', sectionIndex: 4, relativeDueDays: 13, assigneeRole: 'Account exec' },
    { name: 'Open action item tickets', sectionIndex: 4, relativeDueDays: 14, assigneeRole: 'PMO' },
  ],
  ruleTemplates: [
    { name: 'At risk notify owner', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'status' }, conditions: [{ field: 'status', op: 'eq', value: 'At risk' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'QBR item at risk' }], runCount: 0 },
    { name: 'Exec review to follow-ups', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'follow-ups' }], runCount: 0 },
  ],
  dashboardTemplates: [{
    name: 'QBR dashboard',
    charts: [
      { title: 'Tasks by Status', type: 'donut', source: 'tasks', filters: [], measure: 'count' },
      { title: 'QBR burnup', type: 'burnup', source: 'tasks', filters: [], measure: 'count' },
    ],
    layout: [],
  }],
})

const onboardingSections = ['Kickoff', 'Configuration', 'Data migration', 'Training', 'Go-live', '30-day check-in', '90-day check-in / Healthy']

export const b2bOnboardingTemplate = defineTemplate({
  id: 'a2-b2b-onboarding',
  name: 'B2B Customer Onboarding',
  description: 'End-to-end customer onboarding from kickoff through 90-day health review.',
  category: 'Business',
  iconEmoji: '🚀',
  color: 'accent',
  defaultView: 'board',
  sectionNames: onboardingSections,
  customFieldIds: [],
  recommendedFields: [
    { name: 'Customer name', type: 'text' },
    { name: 'CSM', type: 'people' },
    { name: 'AE', type: 'people' },
    { name: 'Contract ARR', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Plan tier', type: 'dropdown', options: enumOptions([{ label: 'Starter', color: 'gray' }, { label: 'Growth', color: 'accent' }, { label: 'Enterprise', color: 'purple' }]) },
    { name: 'Launch date', type: 'date' },
    { name: 'Health', type: 'dropdown', options: enumOptions([{ label: 'Green', color: 'accent' }, { label: 'Yellow', color: 'warning' }, { label: 'Red', color: 'danger' }]) },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Welcome email', 'Schedule kickoff call', 'Confirm success criteria', 'Identify exec sponsors', 'Provision sandbox'], { role: 'AE' }),
    ...tasksInSection(1, ['Provision production tenant', 'Set SSO', 'Configure roles & permissions', 'Brand customization', 'Webhook setup'], { startDay: 3, role: 'CSM' }),
    ...tasksInSection(2, ['Source data audit', 'Map fields', 'Build importer', 'Sample import & validation', 'Full import', 'UAT sign-off'], { startDay: 7, role: 'Implementation', milestoneAt: [4, 5] }),
    ...tasksInSection(3, ['Admin training', 'End-user training (cohort 1)', 'End-user training (cohort 2)', 'Record KB walkthrough', 'Distribute job aids'], { startDay: 14, role: 'CSM' }),
    ...tasksInSection(4, ['Go/no-go meeting', 'Cutover', 'Day-0 hypercare', 'First-week check-in'], { startDay: 21, role: 'CSM' }),
    ...tasksInSection(5, ['Adoption review', 'NPS survey', 'Address blockers'], { startDay: 30, role: 'CSM' }),
    ...tasksInSection(6, ['ROI report', 'Quarterly review', 'Expand opportunities'], { startDay: 90, role: 'CSM' }),
  ],
  ruleTemplates: [
    { name: 'Red health alert', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'health' }, conditions: [{ field: 'health', op: 'eq', value: 'Red' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Customer health is red' }], runCount: 0 },
    { name: 'Kickoff form tasks', enabled: true, trigger: { type: 'form_submitted', formId: 'kickoff-intake' }, conditions: [], actions: [{ type: 'assign_to', userId: 'ae' }], runCount: 0 },
  ],
  formTemplates: [{
    name: 'Kickoff intake',
    fields: [
      { id: 'f1', type: 'short_text', label: 'Company name', required: true },
      { id: 'f2', type: 'short_text', label: 'Primary contact', required: true },
      { id: 'f3', type: 'short_text', label: 'Exec sponsor', required: false },
      { id: 'f4', type: 'date', label: 'Launch target date', required: true },
      { id: 'f5', type: 'dropdown', label: 'SSO required?', required: false, options: enumOptions([{ label: 'Yes', color: 'accent' }, { label: 'No', color: 'gray' }]) },
    ],
    copyAnswersToDescription: true,
    isPublic: false,
    confirmationMessage: 'Thanks — your CSM will follow up.',
  }],
})

export const salesPipelineTemplate = defineTemplate({
  id: 'a3-sales-pipeline',
  name: 'Sales Pipeline Management',
  description: 'Board-style pipeline with example deals and forecasting fields.',
  category: 'Business',
  iconEmoji: '💼',
  color: 'indigo',
  defaultView: 'board',
  sectionNames: ['Lead', 'Qualified', 'Discovery', 'Demo', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Account', type: 'text' },
    { name: 'Primary contact', type: 'text' },
    { name: 'Deal value', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Close date', type: 'date' },
    { name: 'Source', type: 'dropdown', options: enumOptions([{ label: 'Inbound', color: 'blue' }, { label: 'Outbound', color: 'purple' }, { label: 'Referral', color: 'teal' }, { label: 'Partner', color: 'amber' }, { label: 'Event', color: 'rose' }]) },
    { name: 'Stage probability', type: 'number', numberFormat: 'percent' },
    { name: 'Next step', type: 'text' },
    { name: 'Last activity', type: 'date' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    { name: 'Acme Corp — Platform expansion', sectionIndex: 1, relativeDueDays: 45, notes: 'Deal value $120,000', assigneeRole: 'AE' },
    { name: 'Beacon Logistics — Pilot', sectionIndex: 3, relativeDueDays: 20, notes: 'Deal value $35,000', assigneeRole: 'AE' },
    { name: 'Crestwood Health — Renewal & upsell', sectionIndex: 5, relativeDueDays: 10, notes: 'Deal value $250,000', assigneeRole: 'AE' },
    ...tasksInSection(0, ['Update CRM hygiene', 'Weekly pipeline review', 'Forecast call prep'], { role: 'RevOps' }),
    ...tasksInSection(4, ['Proposal template refresh', 'Legal review SLA'], { role: 'Sales ops' }),
  ],
  ruleTemplates: [
    { name: 'Closed won', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: 'closed-won' }, conditions: [], actions: [{ type: 'set_custom_field', customFieldId: 'stage-probability', value: 100 }, { type: 'send_notification', userId: 'owner', message: 'Deal closed won' }], runCount: 0 },
    { name: 'Stale deal', enabled: true, trigger: { type: 'task_due_in_days', days: 14 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Deal inactive 14+ days' }], runCount: 0 },
  ],
  dashboardTemplates: [{
    name: 'Pipeline dashboard',
    charts: [
      { title: 'Pipeline by stage', type: 'bar', source: 'tasks', filters: [], measure: 'sum', measureField: 'deal-value' },
      { title: 'Quarter forecast', type: 'number', source: 'tasks', filters: [], measure: 'sum', measureField: 'deal-value' },
    ],
    layout: [],
  }],
})

export const strategicPlanningTemplate = defineTemplate({
  id: 'a4-strategic-planning',
  name: 'Annual Strategic Planning',
  description: 'Discovery through cascade for annual strategy and board prep.',
  category: 'Business',
  iconEmoji: '🧭',
  color: 'teal',
  defaultView: 'timeline',
  sectionNames: ['Discovery & inputs', 'Strategy hypotheses', 'Financial modeling', 'Cross-functional reviews', 'Board prep', 'Cascade & rollout'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Workstream', type: 'dropdown', options: enumOptions([{ label: 'Market', color: 'blue' }, { label: 'Product', color: 'purple' }, { label: 'Org', color: 'teal' }, { label: 'Finance', color: 'amber' }, { label: 'Tech', color: 'rose' }]) },
    { name: 'Owner', type: 'people' },
    { name: 'Confidence', type: 'dropdown', options: enumOptions([{ label: 'High', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'Low', color: 'danger' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Customer interviews (15)', 'Competitive analysis', 'Macro trends scan', 'Win/loss analysis', 'Internal stakeholder survey'], { role: 'Strategy' }),
    ...tasksInSection(1, ['Draft 3-horizon framework', 'Identify 5 strategic bets', 'Risk register'], { startDay: 14, role: 'Strategy' }),
    ...tasksInSection(2, ['Top-down model', 'Bottom-up model', 'Reconciliation'], { startDay: 21, role: 'FP&A' }),
    ...tasksInSection(3, ['Product roadmap alignment', 'Hiring plan', 'GTM plan'], { startDay: 28, role: 'Functional leads' }),
    ...tasksInSection(4, ['Draft board deck', 'Board pre-read', 'Board meeting'], { startDay: 35, role: 'Chief of Staff', milestoneAt: [2] }),
    ...tasksInSection(5, ['All-hands announcement', 'Department goal-setting', 'OKR rollout'], { startDay: 40, role: 'Chief of Staff' }),
  ],
  ruleTemplates: [
    { name: 'Low confidence flag', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'confidence' }, conditions: [{ field: 'confidence', op: 'eq', value: 'Low' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Strategy item low confidence' }], runCount: 0 },
    { name: 'Board prep gate', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Ready for board prep review' }], runCount: 0 },
  ],
})

export const BUSINESS_TEMPLATES: CuratedProjectTemplate[] = [
  qbrTemplate,
  b2bOnboardingTemplate,
  salesPipelineTemplate,
  strategicPlanningTemplate,
]
