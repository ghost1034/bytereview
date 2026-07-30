/**
 * B. Accounting & Tax templates (B1–B5).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

const closeStatusOptions = enumOptions([
  { label: 'Not started', color: 'gray' },
  { label: 'In progress', color: 'blue' },
  { label: 'Submitted', color: 'warning' },
  { label: 'Reviewed', color: 'accent' },
  { label: 'Returned', color: 'danger' },
  { label: 'Reposted', color: 'purple' },
])

export const monthEndCloseTemplate = defineTemplate({
  id: 'b1-month-end-close',
  name: 'Month-End Close',
  description: 'CPA month-end close by day with reconciliations, adjustments, and reporting.',
  category: 'Accounting & Tax',
  iconEmoji: '📅',
  color: 'info',
  defaultView: 'list',
  recurring: 'Monthly',
  sectionNames: ['Day -2 (Pre-close prep)', 'Day 1–2 (Cutoff)', 'Day 3–5 (Reconciliations)', 'Day 6–8 (Adjustments & accruals)', 'Day 9–10 (Reporting & flux)', 'Wrap-up (Day 11+)'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'GL account', type: 'text' },
    { name: 'Preparer', type: 'people' },
    { name: 'Reviewer', type: 'people' },
    { name: 'Materiality threshold', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Close status', type: 'dropdown', options: closeStatusOptions },
    { name: 'Cycle', type: 'dropdown', options: enumOptions([{ label: 'Revenue', color: 'blue' }, { label: 'Cash', color: 'teal' }, { label: 'AR', color: 'accent' }, { label: 'Inventory', color: 'purple' }, { label: 'AP', color: 'amber' }, { label: 'Payroll', color: 'rose' }, { label: 'Tax', color: 'warning' }, { label: 'Equity', color: 'gray' }, { label: 'Other', color: 'gray' }]) },
    { name: 'Risk', type: 'dropdown', options: enumOptions([{ label: 'Low', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'High', color: 'danger' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Confirm close calendar', 'Lock prior period', 'Distribute close checklist'], { role: 'Controller' }),
    ...tasksInSection(1, ['AR cutoff review', 'AP cutoff review', 'Inventory cutoff', 'Revenue cutoff (ASC 606)', 'Payroll cutoff'], { startDay: 1, role: 'Preparer' }),
    ...tasksInSection(2, ['Bank reconciliation — all accounts', 'AR aging review', 'AP aging review', 'Credit card reconciliation', 'Intercompany reconciliation', 'Prepaid expense schedule', 'Fixed asset roll-forward'], { startDay: 3, role: 'Preparer' }),
    ...tasksInSection(3, ['Accrued payroll', 'Accrued bonuses', 'Accrued revenue', 'Deferred revenue (ASC 606)', 'Lease expense (ASC 842)', 'Stock-based comp (ASC 718)', 'Bad debt / CECL', 'Inventory reserve', 'FX revaluation'], { startDay: 6, role: 'Preparer' }),
    ...tasksInSection(4, ['P&L draft', 'Balance sheet draft', 'Cash flow statement', 'Flux variance — P&L', 'Flux variance — BS', 'MD&A draft', 'Executive deck'], { startDay: 9, role: 'Controller' }),
    ...tasksInSection(5, ['Close post-mortem', 'Update SOPs', "Schedule next month's close"], { startDay: 11, role: 'Controller' }),
  ],
  ruleTemplates: [
    { name: 'Submitted assigns reviewer', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'close-status' }, conditions: [{ field: 'close-status', op: 'eq', value: 'Submitted' }], actions: [{ type: 'assign_to', userId: 'reviewer' }], runCount: 0 },
    { name: 'Books closed update', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Reporting section complete' }], runCount: 0 },
  ],
  dashboardTemplates: [{ name: 'Close dashboard', charts: [{ title: 'Open reconciliations', type: 'lollipop', source: 'tasks', filters: [], measure: 'count' }, { title: 'Days to close', type: 'number', source: 'tasks', filters: [], measure: 'count' }], layout: [] }],
})

export const yearEndAuditTemplate = defineTemplate({
  id: 'b2-year-end-audit',
  name: 'Year-End Close & Audit Readiness',
  description: 'Hard close, audit prep, fieldwork, financial statements, and filing.',
  category: 'Accounting & Tax',
  iconEmoji: '🗂️',
  color: 'primary',
  defaultView: 'gantt',
  sectionNames: ['Pre-close prep (Q4 Week 1)', 'Hard close (Q4 Weeks 2–3)', 'Audit prep (Q4 Week 4)', 'External audit fieldwork (Q1 Weeks 1–4)', 'Financial statements & footnotes', 'Sign-off & filing'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Audit area', type: 'dropdown', options: enumOptions([{ label: 'Revenue', color: 'blue' }, { label: 'Inventory', color: 'purple' }, { label: 'Leases', color: 'teal' }, { label: 'Income Tax', color: 'amber' }, { label: 'Stock Comp', color: 'rose' }, { label: 'Sox ITGC', color: 'gray' }]) },
    { name: 'Audit risk', type: 'dropdown', options: enumOptions([{ label: 'Significant', color: 'danger' }, { label: 'Elevated', color: 'warning' }, { label: 'Standard', color: 'accent' }]) },
    { name: 'PBC status', type: 'dropdown', options: enumOptions([{ label: 'Not requested', color: 'gray' }, { label: 'Requested', color: 'blue' }, { label: 'Received', color: 'accent' }, { label: 'Reviewed', color: 'warning' }, { label: 'Approved', color: 'accent' }]) },
    { name: 'Reviewer level', type: 'dropdown', options: enumOptions([{ label: 'Senior', color: 'blue' }, { label: 'Manager', color: 'purple' }, { label: 'Partner', color: 'indigo' }]) },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Roll-forward trial balance', 'Confirm COA mapping', 'Update fixed asset roll-forward', 'Stock comp roll-forward', 'Convertible debt classification'], { role: 'Controller' }),
    ...tasksInSection(1, ['Revenue cutoff (extended)', 'Inventory observation', 'Confirmations — AR', 'Confirmations — AP', 'Confirmations — Bank/Debt', 'Goodwill impairment (ASC 350)', 'Lease remeasurements (ASC 842)', 'Income tax provision (ASC 740)', 'Going concern memo', 'Subsequent events review'], { startDay: 7, role: 'Preparer', milestoneAt: [1] }),
    ...tasksInSection(2, ['PBC list build', 'Open audit portal', 'Sample selection methodology', 'Walkthroughs refresh', 'ITGC walkthroughs'], { startDay: 21, role: 'Audit liaison' }),
    ...tasksInSection(3, ['Field auditor onboarding', 'Daily standups', 'Open items log', 'Management representations', 'Audit committee comms (SAS 114/115)'], { startDay: 28, role: 'Controller' }),
    ...tasksInSection(4, ['Draft statements', 'Footnotes — policies', 'Footnotes — Revenue', 'Footnotes — Leases', 'Footnotes — Taxes', 'Footnotes — Stock comp', 'Footnotes — Subsequent events', 'XBRL tagging'], { startDay: 49, role: 'Reporting' }),
    ...tasksInSection(5, ['Disclosure committee', 'Audit committee approval', 'Officer certifications', 'Auditor consent', 'Filing'], { startDay: 63, role: 'CFO', milestoneAt: [4] }),
  ],
  ruleTemplates: [
    { name: 'PBC SLA watch', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'pbc-status' }, conditions: [{ field: 'pbc-status', op: 'eq', value: 'Requested' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'PBC SLA watch started' }], runCount: 0 },
    { name: 'Significant risk collaborators', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'audit-risk' }, conditions: [{ field: 'audit-risk', op: 'eq', value: 'Significant' }], actions: [{ type: 'add_collaborator', userId: 'manager' }], runCount: 0 },
  ],
})

export const form1040Template = defineTemplate({
  id: 'b3-form-1040',
  name: 'Individual Tax Return Preparation (Form 1040)',
  description: '1040 workflow from engagement through e-file and archive.',
  category: 'Accounting & Tax',
  iconEmoji: '🧾',
  color: 'warning',
  defaultView: 'board',
  recurring: 'Annual',
  sectionNames: ['Engagement / Docs requested', 'Docs received & organized', 'Input / Preparation', 'Senior review', 'Manager review', 'Partner sign-off', 'Client signature (Form 8879)', 'E-filed', 'Acknowledged & archived'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Client name', type: 'text' },
    { name: 'Tax year', type: 'number' },
    { name: 'Return type', type: 'dropdown', options: enumOptions([{ label: '1040', color: 'blue' }, { label: '1040 + State', color: 'purple' }, { label: '1040 + Multi-state', color: 'teal' }, { label: '1040NR', color: 'amber' }]) },
    { name: 'Complexity', type: 'dropdown', options: enumOptions([{ label: 'Simple', color: 'accent' }, { label: 'Standard', color: 'blue' }, { label: 'Complex', color: 'warning' }, { label: 'High-net-worth', color: 'danger' }]) },
    { name: 'Estimated fee', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Filed date', type: 'date' },
    { name: 'Extension filed?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Send 1040 organizer', 'Send engagement letter', 'Send portal invite'], { role: 'Admin' }),
    ...tasksInSection(1, ['Receive W-2(s)', 'Receive 1099-INT/DIV/B', 'Receive K-1s', 'Receive 1098', 'Receive cap gains supplemental', 'Receive HSA / 1099-SA', 'Receive 1095-A/B/C', 'Receive prior-year return'], { startDay: 3, role: 'Admin' }),
    ...tasksInSection(2, ['Wages & withholding', 'Interest & dividends (Sch B)', 'Itemized deductions (Sch A)', 'Self-employment (Sch C)', 'Capital gains (Sch D)', 'Rental real estate (Sch E)', 'K-1 pass-through inputs', 'Foreign accounts (FBAR/8938)', 'AMT calculation', 'Retirement / IRA', 'Education credits', 'Child tax credit', 'Estimated payments applied'], { startDay: 7, role: 'Preparer' }),
    ...tasksInSection(3, ['Diagnostic check', 'Tie-out to source docs', 'Variance from prior year'], { startDay: 14, role: 'Senior' }),
    ...tasksInSection(4, ['Sign-off checklist', 'Risk areas review'], { startDay: 16, role: 'Manager' }),
    ...tasksInSection(5, ['Final review', 'Approve invoice'], { startDay: 18, role: 'Partner' }),
    ...tasksInSection(6, ['Send Form 8879 e-sign', 'Confirm fee payment'], { startDay: 19, role: 'Admin' }),
    ...tasksInSection(7, ['Submit return', 'Confirm acknowledgement'], { startDay: 20, role: 'Preparer' }),
    ...tasksInSection(8, ['File in DMS', 'Update client master record'], { startDay: 21, role: 'Admin' }),
  ],
  ruleTemplates: [
    { name: 'Docs to input', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'input' }], runCount: 0 },
    { name: 'HNW reviewers', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'complexity' }, conditions: [{ field: 'complexity', op: 'eq', value: 'High-net-worth' }], actions: [{ type: 'add_collaborator', userId: 'partner' }], runCount: 0 },
  ],
})

export const auditEngagementTemplate = defineTemplate({
  id: 'b4-audit-engagement',
  name: 'Financial Statement Audit Engagement',
  description: 'External audit lifecycle from acceptance through report issuance.',
  category: 'Accounting & Tax',
  iconEmoji: '🔍',
  color: 'danger',
  defaultView: 'gantt',
  sectionNames: ['Client acceptance / continuance', 'Planning & risk assessment', 'Interim fieldwork', 'Year-end fieldwork', 'Completion & wrap-up', 'Report issuance'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Client', type: 'text' },
    { name: 'Engagement partner', type: 'people' },
    { name: 'Manager', type: 'people' },
    { name: 'Risk rating', type: 'dropdown', options: enumOptions([{ label: 'Standard', color: 'accent' }, { label: 'Elevated', color: 'warning' }, { label: 'Significant', color: 'danger' }]) },
    { name: 'Materiality', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Workpaper status', type: 'dropdown', options: enumOptions([{ label: 'Not started', color: 'gray' }, { label: 'In progress', color: 'blue' }, { label: 'Submitted', color: 'warning' }, { label: 'Reviewed', color: 'accent' }, { label: 'Approved', color: 'accent' }]) },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Independence checks', 'AML/KYC', 'Engagement letter', 'Pricing memo', 'Risk acceptance memo'], { role: 'Partner' }),
    ...tasksInSection(1, ['Understand entity & environment', 'Identify significant accounts', 'Fraud risk assessment', 'Set materiality', 'Audit strategy memo', 'Engagement budget', 'Staffing & schedule'], { startDay: 7, role: 'Manager' }),
    ...tasksInSection(2, ['Walkthroughs — Revenue, P2P, Payroll', 'Test design of controls', 'Test operating of key controls', 'ITGC testing', 'Identify deficiencies'], { startDay: 14, role: 'Senior' }),
    ...tasksInSection(3, ['Trial balance tie-out', 'Substantive analytics', 'Test of details by area', 'Journal entry testing', 'Related party review', 'Litigation letter', 'Going concern memo', 'Subsequent events'], { startDay: 30, role: 'Senior' }),
    ...tasksInSection(4, ['Final analytical review', 'Summary of audit differences', 'Aggregate misstatements vs materiality', 'Management representations', 'Disclosure checklist', 'EQR / second partner review', 'Audit committee comms', 'Wrap-up file index'], { startDay: 45, role: 'Manager', milestoneAt: [5] }),
    ...tasksInSection(5, ['Draft opinion', 'Tie-out report to financials', 'Issue opinion', 'Archive workpapers'], { startDay: 52, role: 'Partner', milestoneAt: [2] }),
  ],
  ruleTemplates: [
    { name: 'Workpaper review chain', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'workpaper-status' }, conditions: [{ field: 'workpaper-status', op: 'eq', value: 'Submitted' }], actions: [{ type: 'assign_to', userId: 'reviewer' }], runCount: 0 },
    { name: 'Significant requires EQR', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'risk-rating' }, conditions: [{ field: 'risk-rating', op: 'eq', value: 'Significant' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'EQR required before issuance' }], runCount: 0 },
  ],
})

export const cpaClientOnboardingTemplate = defineTemplate({
  id: 'b5-cpa-client-onboarding',
  name: 'New Client Engagement Onboarding (CPA Firm)',
  description: 'Prospect through active engagement for CPA firm clients.',
  category: 'Accounting & Tax',
  iconEmoji: '🤝',
  color: 'accent',
  defaultView: 'list',
  sectionNames: ['Prospect', 'Conflict & risk acceptance', 'Engagement letter & pricing', 'Kickoff & data access', 'Active'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Client name', type: 'text' },
    { name: 'Service line', type: 'dropdown', options: enumOptions([{ label: 'Tax', color: 'blue' }, { label: 'Audit', color: 'purple' }, { label: 'Advisory', color: 'teal' }, { label: 'Bookkeeping', color: 'amber' }, { label: 'Wealth', color: 'rose' }]) },
    { name: 'Industry', type: 'dropdown', options: enumOptions([{ label: 'Tech', color: 'blue' }, { label: 'Healthcare', color: 'teal' }, { label: 'Manufacturing', color: 'gray' }, { label: 'Nonprofit', color: 'purple' }]) },
    { name: 'Entity type', type: 'dropdown', options: enumOptions([{ label: 'C-Corp', color: 'blue' }, { label: 'S-Corp', color: 'purple' }, { label: 'LLC', color: 'teal' }, { label: 'Individual', color: 'amber' }]) },
    { name: 'Fee structure', type: 'dropdown', options: enumOptions([{ label: 'Hourly', color: 'gray' }, { label: 'Fixed', color: 'blue' }, { label: 'Retainer', color: 'accent' }]) },
    { name: 'Engagement partner', type: 'people' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Discovery call', 'Send capabilities deck', 'Pricing scoping', 'Proposal sent'], { role: 'Partner' }),
    ...tasksInSection(1, ['Conflict check', 'AML / KYC', 'Independence check', 'Risk acceptance memo'], { startDay: 3, role: 'Risk' }),
    ...tasksInSection(2, ['Draft engagement letter', 'Internal review', 'Send for client signature'], { startDay: 7, role: 'Manager' }),
    ...tasksInSection(3, ['Schedule kickoff', 'Provision portal', 'Provision DMS folder', 'Add to billing system', 'Add to CRM', 'Issue retainer invoice'], { startDay: 10, role: 'Admin' }),
    ...tasksInSection(4, ['Set up recurring template', 'Confirm staffing', 'Update partner rosters'], { startDay: 14, role: 'Partner' }),
  ],
  ruleTemplates: [
    { name: 'Audit independence', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'service-line' }, conditions: [{ field: 'service-line', op: 'eq', value: 'Audit' }], actions: [{ type: 'create_subtask', templateName: 'Independence check' }], runCount: 0 },
    { name: 'AML stuck alert', enabled: true, trigger: { type: 'task_due_in_days', days: 5 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'AML/KYC overdue' }], runCount: 0 },
  ],
})

export const ACCOUNTING_TEMPLATES: CuratedProjectTemplate[] = [
  monthEndCloseTemplate,
  yearEndAuditTemplate,
  form1040Template,
  auditEngagementTemplate,
  cpaClientOnboardingTemplate,
]
