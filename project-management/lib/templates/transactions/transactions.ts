/**
 * G1 & G2 corporate transaction templates (step 27c).
 */
import { ALL_VIEWS, defineTemplate, enumOptions, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'
import { buildG1TaskSpecs, G1_SECTIONS } from './g1Tasks'
import { buildG2TaskSpecs, G2_SECTIONS } from './g2Tasks'
import { pmiSubTemplate } from './pmi'
import { tsaSubTemplate } from './tsa'

/** G1 — Strategic Acquisition (Buy-Side, End-to-End). */
export const strategicAcquisitionTemplate = defineTemplate({
  id: 'g1-strategic-acquisition',
  name: 'Strategic Acquisition (Buy-Side, End-to-End)',
  description: 'Buy-side M&A from mandate through Day-100 integration and Year-1 value capture.',
  category: 'Corporate Dev',
  iconEmoji: '🎯',
  color: 'indigo',
  defaultView: 'gantt',
  enabledViews: ALL_VIEWS,
  heavy: true,
  suggestedBundles: ['Status', 'Priority'],
  sectionNames: G1_SECTIONS,
  customFieldIds: [],
  recommendedFields: [
    { name: 'Target company', type: 'text' },
    { name: 'Deal codename', type: 'text' },
    { name: 'Deal type', type: 'dropdown', options: enumOptions([{ label: 'Asset purchase', color: 'blue' }, { label: 'Stock purchase', color: 'purple' }, { label: 'Forward triangular merger', color: 'teal' }, { label: 'Tender offer', color: 'amber' }]) },
    { name: 'Deal status', type: 'dropdown', options: enumOptions([{ label: 'Identified', color: 'gray' }, { label: 'LOI', color: 'warning' }, { label: 'Closed', color: 'accent' }, { label: 'Dropped', color: 'danger' }]) },
    { name: 'Workstream', type: 'dropdown', options: enumOptions([{ label: 'Strategy', color: 'blue' }, { label: 'Legal', color: 'indigo' }, { label: 'Tax', color: 'amber' }, { label: 'Finance', color: 'teal' }, { label: 'HR/Org', color: 'rose' }, { label: 'IT', color: 'purple' }, { label: 'Integration', color: 'accent' }]) },
    { name: 'Enterprise value', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Synergy target — annual', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Diligence severity', type: 'dropdown', options: enumOptions([{ label: 'Clean', color: 'accent' }, { label: 'Minor', color: 'blue' }, { label: 'Material', color: 'warning' }, { label: 'Deal-killer', color: 'danger' }]) },
    { name: 'Critical path?', type: 'checkbox' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: buildG1TaskSpecs(),
  siblingProjects: [{ suffix: ' — Risk Register', templateId: 'txn-risk-register', linkAs: 'sibling' }],
  childProjectOffer: {
    triggerTaskName: 'Execute closing documents',
    childTemplateId: 'g1-pmi-subtemplate',
    namePattern: '{target} — Post-Merger Integration',
    toastMessage: 'Create the PMI project for this acquisition?',
  },
  ruleTemplates: [
    { name: 'Exclusivity countdown', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'LOI executed — exclusivity timer started' }], runCount: 0 },
    { name: 'Material diligence escalation', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'diligence-severity' }, conditions: [{ field: 'diligence-severity', op: 'eq', value: 'Material' }], actions: [{ type: 'add_collaborator', userId: 'cfo' }, { type: 'add_collaborator', userId: 'gc' }], runCount: 0 },
    { name: 'PMI spawn on close', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Offer to spawn PMI child project' }], runCount: 0 },
    { name: 'Critical path slip', enabled: true, trigger: { type: 'task_due_in_days', days: 1 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Critical path task overdue' }], runCount: 0 },
    { name: 'Clean team banner', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'workstream' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Clean-team only — gun-jumping aware' }], runCount: 0 },
    { name: 'Synergy stage gate', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'synergy-type' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Synergy initiative stage changed' }], runCount: 0 },
    { name: 'Day-N milestone reviews', enabled: true, trigger: { type: 'task_due_in_days', days: 30 }, conditions: [], actions: [{ type: 'create_subtask', templateName: '30-day review' }], runCount: 0 },
  ],
  formTemplates: [{
    name: 'Diligence question to Seller',
    fields: [
      { id: 'ws', type: 'dropdown', label: 'Workstream', required: true, options: enumOptions([{ label: 'Legal', color: 'indigo' }, { label: 'Tax', color: 'amber' }, { label: 'Financial', color: 'teal' }]) },
      { id: 'q', type: 'long_text', label: 'Question', required: true },
      { id: 'pri', type: 'dropdown', label: 'Priority', required: true, options: enumOptions([{ label: 'Low', color: 'gray' }, { label: 'Med', color: 'warning' }, { label: 'High', color: 'danger' }]) },
    ],
    copyAnswersToDescription: true,
    isPublic: false,
    confirmationMessage: 'Question logged in diligence queue.',
  }, {
    name: 'Synergy initiative proposal',
    fields: [
      { id: 'n', type: 'short_text', label: 'Initiative name', required: true },
      { id: 't', type: 'dropdown', label: 'Type', required: true, options: enumOptions([{ label: 'Cost', color: 'blue' }, { label: 'Revenue', color: 'accent' }]) },
      { id: 'rr', type: 'number', label: 'Annual run-rate ($)', required: true },
    ],
    copyAnswersToDescription: true,
    isPublic: false,
    confirmationMessage: 'Synergy proposal submitted.',
  }],
  dashboardTemplates: [{
    name: 'Acquisition command center',
    charts: [
      { title: 'Diligence burnup', type: 'burnup', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Days to Close', type: 'number', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Findings by workstream', type: 'bar', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Synergy run-rate vs plan', type: 'line', source: 'tasks', filters: [], measure: 'sum' },
      { title: 'Day-1 readiness', type: 'donut', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Top synergies', type: 'lollipop', source: 'tasks', filters: [], measure: 'sum' },
    ],
    layout: [],
  }],
  relatedTemplateIds: ['c4-ma-closing', 'c3-contract-review', 'g1-pmi-subtemplate'],
})

/** G2 — Company Spin-off / Divestiture / Carve-out. */
export const spinoffTemplate = defineTemplate({
  id: 'g2-spinoff-divestiture',
  name: 'Company Spin-off / Divestiture / Carve-out',
  description: 'Separation from mandate through TSA exit and post-separation monitoring.',
  category: 'Corporate Dev',
  iconEmoji: '✂️',
  color: 'primary',
  defaultView: 'gantt',
  enabledViews: ALL_VIEWS,
  heavy: true,
  sectionNames: G2_SECTIONS,
  customFieldIds: [],
  recommendedFields: [
    { name: 'Business unit / SpinCo name', type: 'text' },
    { name: 'Project codename', type: 'text' },
    { name: 'Separation type', type: 'dropdown', options: enumOptions([{ label: 'Tax-free Spin-off (§355)', color: 'blue' }, { label: 'Sale to Strategic', color: 'purple' }, { label: 'Sale to PE/Sponsor', color: 'teal' }, { label: 'IPO Carve-out', color: 'amber' }]) },
    { name: 'Status', type: 'dropdown', options: enumOptions([{ label: 'Mandate', color: 'gray' }, { label: 'Planning', color: 'blue' }, { label: 'Active', color: 'warning' }, { label: 'TSA in flight', color: 'purple' }, { label: 'TSA Exited', color: 'accent' }]) },
    { name: 'Workstream', type: 'dropdown', options: enumOptions([{ label: 'Strategy/M&A', color: 'blue' }, { label: 'Tax', color: 'amber' }, { label: 'IT', color: 'purple' }, { label: 'TSA', color: 'teal' }]) },
    { name: 'Target close date', type: 'date' },
    { name: 'Estimated proceeds', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'TSA scope', type: 'dropdown', options: enumOptions([{ label: 'None', color: 'gray' }, { label: 'Light', color: 'blue' }, { label: 'Medium', color: 'warning' }, { label: 'Heavy', color: 'danger' }]) },
    { name: 'Run-rate stranded costs', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Critical path?', type: 'checkbox' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: buildG2TaskSpecs(),
  siblingProjects: [{ suffix: ' — Risk Register', templateId: 'txn-spinoff-risk-register', linkAs: 'sibling' }],
  childProjectOffer: {
    triggerTaskName: 'Day-1 readiness checklist (per workstream)',
    childTemplateId: 'g2-tsa-subtemplate',
    namePattern: '{spinco} — Transition Services Agreement (TSA)',
    toastMessage: 'Create the TSA Execution project for SpinCo?',
  },
  ruleTemplates: [
    { name: '§355 required tasks', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'separation-type' }, conditions: [{ field: 'separation-type', op: 'eq', value: 'Tax-free Spin-off (§355)' }], actions: [{ type: 'send_notification', userId: 'owner', message: '§355 qualification tasks required' }], runCount: 0 },
    { name: 'Sale-only tasks', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'separation-type' }, conditions: [{ field: 'separation-type', op: 'eq', value: 'Sale to Strategic' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Showing sale-only workstream' }], runCount: 0 },
    { name: 'TSA spawn prompt', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Offer to spawn TSA child project' }], runCount: 0 },
    { name: 'TSA exit alert', enabled: true, trigger: { type: 'task_due_in_days', days: 30 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'TSA service exit within 30 days' }], runCount: 0 },
    { name: 'Stranded cost watch', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'stranded-costs' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Stranded cost chart updated' }], runCount: 0 },
    { name: 'Anti-Morris-Trust', enabled: true, trigger: { type: 'task_added_to_project' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: '§355 compliance review for SpinCo acquisition' }], runCount: 0 },
    { name: 'Communications gating', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'External comms restricted to deal team' }], runCount: 0 },
    { name: 'WARN compliance', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'set_due_in_days', days: 60 }], runCount: 0 },
  ],
  formTemplates: [{
    name: 'TSA service request from Spin-Co',
    fields: [
      { id: 'sn', type: 'short_text', label: 'Service name', required: true },
      { id: 'cat', type: 'dropdown', label: 'Service category', required: true, options: enumOptions([{ label: 'IT', color: 'blue' }, { label: 'Finance', color: 'amber' }, { label: 'HR', color: 'teal' }]) },
      { id: 'd1', type: 'dropdown', label: 'Required Day-1?', required: false, options: enumOptions([{ label: 'Yes', color: 'accent' }, { label: 'No', color: 'gray' }]) },
    ],
    copyAnswersToDescription: true,
    isPublic: false,
    confirmationMessage: 'TSA service request submitted.',
  }],
  dashboardTemplates: [{
    name: 'Separation command center',
    charts: [
      { title: 'Day-1 readiness burnup', type: 'burnup', source: 'tasks', filters: [], measure: 'count' },
      { title: 'TSA services by status', type: 'donut', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Separation costs', type: 'number', source: 'tasks', filters: [], measure: 'sum' },
      { title: 'Capability gaps', type: 'bar', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Stranded cost reduction', type: 'line', source: 'tasks', filters: [], measure: 'sum' },
      { title: 'Top TSA services by cost', type: 'lollipop', source: 'tasks', filters: [], measure: 'sum' },
    ],
    layout: [],
  }],
  relatedTemplateIds: ['e2-vendor-onboarding', 'f2-new-hire-onboarding', 'c3-contract-review'],
})

export const TRANSACTION_TEMPLATES: CuratedProjectTemplate[] = [
  strategicAcquisitionTemplate,
  spinoffTemplate,
  pmiSubTemplate,
  tsaSubTemplate,
]

export { riskRegisterTemplate, spinoffRiskRegisterTemplate } from './riskRegister'
