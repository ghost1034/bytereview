/**
 * D. Finance templates (D1–D4).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

export const annualBudgetTemplate = defineTemplate({
  id: 'd1-annual-budget',
  name: 'Annual Budget Planning',
  description: 'Assumptions through board approval and ERP load.',
  category: 'Finance',
  iconEmoji: '💰',
  color: 'accent',
  defaultView: 'timeline',
  sectionNames: ['Assumptions & drivers', 'Department submissions', 'Consolidation', 'FP&A review', 'Executive review', 'Board approval', 'Finalize & load'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Department', type: 'dropdown', options: enumOptions([{ label: 'Sales', color: 'blue' }, { label: 'Marketing', color: 'purple' }, { label: 'Engineering', color: 'teal' }, { label: 'G&A', color: 'gray' }, { label: 'Finance', color: 'amber' }]) },
    { name: 'Submission status', type: 'dropdown', options: enumOptions([{ label: 'Not started', color: 'gray' }, { label: 'Drafting', color: 'blue' }, { label: 'Submitted', color: 'warning' }, { label: 'Approved', color: 'accent' }]) },
    { name: 'Approved amount', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Set FX rates', 'Set inflation assumptions', 'Set revenue plan', 'Set hiring philosophy', 'Set comp inflation', 'Define cost allocation'], { role: 'FP&A' }),
    ...tasksInSection(1, ['Distribute templates', 'Q&A office hours', 'Sales budget submitted', 'Marketing budget submitted', 'Eng budget submitted', 'G&A budget submitted'], { startDay: 7, role: 'FBP' }),
    ...tasksInSection(2, ['Top-down model', 'Bottom-up consolidation', 'Reconciliation', 'Scenario analysis'], { startDay: 21, role: 'FP&A' }),
    ...tasksInSection(3, ['Department review meetings', 'Pushback memos', 'Revised submissions'], { startDay: 28, role: 'FP&A' }),
    ...tasksInSection(4, ['CFO review', 'CEO review', 'Operating committee approval'], { startDay: 35, role: 'CFO' }),
    ...tasksInSection(5, ['Board package', 'Board meeting'], { startDay: 42, role: 'CFO', milestoneAt: [1] }),
    ...tasksInSection(6, ['Load into ERP', 'Lock budget', 'Distribute approved budgets'], { startDay: 45, role: 'FP&A' }),
  ],
  ruleTemplates: [
    { name: 'Submitted to FP&A', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'submission-status' }, conditions: [{ field: 'submission-status', op: 'eq', value: 'Submitted' }], actions: [{ type: 'assign_to', userId: 'fpa' }], runCount: 0 },
    { name: 'All approved unlock exec', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Departments approved — exec review' }], runCount: 0 },
  ],
})

export const fpaCloseTemplate = defineTemplate({
  id: 'd2-fpa-close',
  name: 'Monthly FP&A Close & Reporting',
  description: 'Month-end FP&A reporting pack and rolling forecast.',
  category: 'Finance',
  iconEmoji: '📈',
  color: 'info',
  defaultView: 'list',
  recurring: 'Monthly',
  sectionNames: ['Data load (Day 1–3)', 'Variance analysis (Day 4–6)', 'Commentary (Day 6–8)', 'Reporting pack (Day 8–10)', 'Distribution (Day 10–11)', 'Forecasting (Day 12–15)'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Function', type: 'dropdown', options: enumOptions([{ label: 'Sales', color: 'blue' }, { label: 'Marketing', color: 'purple' }, { label: 'Engineering', color: 'teal' }, { label: 'G&A', color: 'gray' }]) },
    { name: 'Metric', type: 'text' },
    { name: 'Variance threshold', type: 'number', numberFormat: 'percent' },
    { name: 'Variance direction', type: 'dropdown', options: enumOptions([{ label: 'Favorable', color: 'accent' }, { label: 'Unfavorable', color: 'danger' }, { label: 'Within tolerance', color: 'gray' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Confirm books closed', 'Load actuals into FP&A tool', 'Reconcile to GL', 'Refresh data connections', 'Validate T-bal tie-out'], { role: 'FP&A' }),
    ...tasksInSection(1, ['P&L vs budget by dept', 'P&L vs forecast', 'KPI deltas', 'Headcount actual vs plan', 'Cost driver analysis'], { startDay: 4, role: 'FBP' }),
    ...tasksInSection(2, ['Draft executive summary', 'Department commentary', 'Risks & opportunities log'], { startDay: 6, role: 'FP&A' }),
    ...tasksInSection(3, ['CFO pack', 'CEO 1-pager', 'Board snapshot', 'Investor metrics pack', 'Functional decks'], { startDay: 8, role: 'FP&A' }),
    ...tasksInSection(4, ['Send to leadership', 'FBP review meetings', 'Update wiki'], { startDay: 10, role: 'FP&A' }),
    ...tasksInSection(5, ['Rolling forecast update', 'Reforecast risk-adjusted', 'Cash forecast update'], { startDay: 12, role: 'FP&A' }),
  ],
  ruleTemplates: [
    { name: 'Unfavorable variance', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'variance-direction' }, conditions: [{ field: 'variance-direction', op: 'eq', value: 'Unfavorable' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Unfavorable variance — CFO notified' }], runCount: 0 },
    { name: 'Reporting delivered', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Month-end reporting delivered' }], runCount: 0 },
  ],
})

export const sox404Template = defineTemplate({
  id: 'd3-sox-404',
  name: 'SOX 404 Compliance Cycle',
  description: 'Scoping through certifications for SOX 404.',
  category: 'Finance',
  iconEmoji: '🛡️',
  color: 'warning',
  defaultView: 'list',
  recurring: 'Quarterly',
  sectionNames: ['Scoping & risk assessment', 'Process narratives & walkthroughs', 'Design effectiveness', 'Operating effectiveness', 'Deficiency tracking & remediation', 'Reporting & certifications'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Process area', type: 'dropdown', options: enumOptions([{ label: 'Order-to-Cash', color: 'blue' }, { label: 'Procure-to-Pay', color: 'purple' }, { label: 'Record-to-Report', color: 'teal' }, { label: 'IT General Controls', color: 'gray' }]) },
    { name: 'Control ID', type: 'text' },
    { name: 'Test status', type: 'dropdown', options: enumOptions([{ label: 'Designed', color: 'gray' }, { label: 'Tested-Effective', color: 'accent' }, { label: 'Tested-Exception', color: 'danger' }, { label: 'Remediated', color: 'warning' }]) },
    { name: 'Severity', type: 'dropdown', options: enumOptions([{ label: 'Deficiency', color: 'warning' }, { label: 'Significant Deficiency', color: 'danger' }, { label: 'Material Weakness', color: 'danger' }]) },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Materiality calculation', 'Significant account scoping', 'Process scoping', 'Location scoping', 'Update RCM'], { role: 'Internal Audit' }),
    ...tasksInSection(1, ['Walkthrough — O2C', 'Walkthrough — P2P', 'Walkthrough — R2R', 'Walkthrough — H2R', 'Walkthrough — ITGCs'], { startDay: 7, role: 'IA' }),
    ...tasksInSection(2, ['Evaluate control design', 'Identify design gaps', 'Approve RCM updates'], { startDay: 14, role: 'IA' }),
    ...tasksInSection(3, ['Test plan per control', 'Sample selection', 'Perform testing', 'Document workpapers', 'Identify exceptions'], { startDay: 21, role: 'IA' }),
    ...tasksInSection(4, ['Root cause analysis', 'Remediation plan', 'Re-test post-remediation', 'Aggregate deficiencies'], { startDay: 35, role: 'IA' }),
    ...tasksInSection(5, ["Management's assessment", 'CEO/CFO certifications', 'Internal Audit report', 'Audit committee report'], { startDay: 42, role: 'Controller' }),
  ],
  ruleTemplates: [
    { name: 'Material weakness escalate', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'severity' }, conditions: [{ field: 'severity', op: 'eq', value: 'Material Weakness' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Material weakness — 24h escalation' }], runCount: 0 },
    { name: 'Exception remediation', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'test-status' }, conditions: [{ field: 'test-status', op: 'eq', value: 'Tested-Exception' }], actions: [{ type: 'create_subtask', templateName: 'Remediation task' }], runCount: 0 },
  ],
})

export const secReportingTemplate = defineTemplate({
  id: 'd4-sec-reporting',
  name: '10-K / 10-Q Financial Reporting',
  description: 'SEC filing workflow from pre-close through EDGAR.',
  category: 'Finance',
  iconEmoji: '📄',
  color: 'primary',
  defaultView: 'list',
  recurring: 'Quarterly',
  sectionNames: ['Pre-close coordination', 'Drafting', 'Internal review', 'Disclosure committee', 'Audit committee', 'Auditor sign-off', 'EDGAR filing'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Section of filing', type: 'dropdown', options: enumOptions([{ label: 'Item 7 MD&A', color: 'blue' }, { label: 'Item 8 Financials', color: 'purple' }, { label: 'Item 1A Risk Factors', color: 'teal' }, { label: 'Item 9A Controls', color: 'amber' }]) },
    { name: 'Owner', type: 'people' },
    { name: 'Reviewer', type: 'people' },
    { name: 'Tie-out done?', type: 'checkbox' },
    { name: 'XBRL tagged?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Close calendar with Accounting', 'Confirm material events', 'Confirm restatements'], { role: 'Reporting' }),
    ...tasksInSection(1, ['Update business description', 'Update risk factors', 'Update MD&A', 'Financial statements draft', 'Footnotes update', 'Exhibits update'], { startDay: 5, role: 'Reporting' }),
    ...tasksInSection(2, ['Cross-functional review', 'Tie-out numbers & references', 'Edgar-ready file build'], { startDay: 15, role: 'Reporting' }),
    ...tasksInSection(3, ['Disclosure committee meeting', 'Address comments'], { startDay: 20, role: 'GC', milestoneAt: [0] }),
    ...tasksInSection(4, ['Pre-read distribution', 'Audit committee meeting'], { startDay: 22, role: 'Reporting', milestoneAt: [1] }),
    ...tasksInSection(5, ['Provide near-final draft', 'Auditor consent', 'Comfort letter'], { startDay: 25, role: 'Reporting' }),
    ...tasksInSection(6, ['Final certifications', 'EDGAR file & XBRL', 'File on EDGAR', 'Press release & 8-K'], { startDay: 28, role: 'Reporting', milestoneAt: [2] }),
  ],
  ruleTemplates: [
    { name: 'Block approve without tie-out', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'tie-out' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Tie-out required before approval' }], runCount: 0 },
    { name: 'Filed status update', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: '10-Q/10-K filed' }], runCount: 0 },
  ],
})

export const FINANCE_TEMPLATES: CuratedProjectTemplate[] = [
  annualBudgetTemplate,
  fpaCloseTemplate,
  sox404Template,
  secReportingTemplate,
]
