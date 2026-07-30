/**
 * C. Law Firm templates (C1–C4).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

export const matterIntakeTemplate = defineTemplate({
  id: 'c1-matter-intake',
  name: 'New Matter Intake & Conflict Check',
  description: 'Intake, conflicts, engagement, trust accounting, and matter opening.',
  category: 'Law',
  iconEmoji: '⚖️',
  color: 'indigo',
  defaultView: 'list',
  sectionNames: ['Intake', 'Conflict check', 'Engagement & pricing', 'Trust accounting', 'Matter open'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Practice area', type: 'dropdown', options: enumOptions([{ label: 'Litigation', color: 'danger' }, { label: 'Corporate', color: 'blue' }, { label: 'M&A', color: 'purple' }, { label: 'IP', color: 'teal' }, { label: 'Employment', color: 'amber' }]) },
    { name: 'Responsible attorney', type: 'people' },
    { name: 'Fee arrangement', type: 'dropdown', options: enumOptions([{ label: 'Hourly', color: 'gray' }, { label: 'Flat fee', color: 'blue' }, { label: 'Contingency', color: 'warning' }, { label: 'Retainer', color: 'accent' }]) },
    { name: 'Conflict status', type: 'dropdown', options: enumOptions([{ label: 'Not run', color: 'gray' }, { label: 'Cleared', color: 'accent' }, { label: 'Waivable', color: 'warning' }, { label: 'Hard conflict', color: 'danger' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Client intake form', 'Initial call (30 min)', 'Identify scope & deliverables', 'Identify parties'], { role: 'Intake' }),
    ...tasksInSection(1, ['Run conflict search', 'Review hits', 'Resolve conflicts / waivers', 'Document resolution'], { startDay: 1, role: 'Conflicts' }),
    ...tasksInSection(2, ['Draft engagement letter', 'Pricing approval', 'Send for client signature'], { startDay: 3, role: 'Attorney' }),
    ...tasksInSection(3, ['Calculate trust deposit', 'Send trust deposit invoice', 'Confirm funds received (IOLTA)'], { startDay: 5, role: 'Billing' }),
    ...tasksInSection(4, ['Open matter in PMS', 'Assign matter number', 'Set up timekeepers', 'Calendar key dates', 'Open electronic folder', 'Update CRM'], { startDay: 7, role: 'Admin' }),
  ],
  ruleTemplates: [
    { name: 'Hard conflict decline', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'conflict-status' }, conditions: [{ field: 'conflict-status', op: 'eq', value: 'Hard conflict' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Hard conflict — escalate to MP' }], runCount: 0 },
    { name: 'Trust unlocks open', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'matter-open' }], runCount: 0 },
  ],
})

export const litigationTemplate = defineTemplate({
  id: 'c2-litigation',
  name: 'Litigation Case Management',
  description: 'Full litigation lifecycle from pre-filing through appeal and close.',
  category: 'Law',
  iconEmoji: '🧑‍⚖️',
  color: 'danger',
  defaultView: 'timeline',
  sectionNames: ['Pre-filing / Demand', 'Pleadings', 'Discovery', 'Motions', 'Trial preparation', 'Trial', 'Post-trial / Appeal', 'Closed'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Docket number', type: 'text' },
    { name: 'Opposing counsel', type: 'text' },
    { name: 'Trial date', type: 'date' },
    { name: 'Discovery deadline', type: 'date' },
    { name: 'Critical?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Investigate facts', 'Interview client / witnesses', 'Demand letter draft', 'Demand letter sent', 'Tolling agreement'], { role: 'Associate', milestoneAt: [3] }),
    ...tasksInSection(1, ['Draft complaint', 'Review with client', 'File complaint', 'Serve summons', 'Receive answer', 'Reply to counterclaim'], { startDay: 14, role: 'Associate', milestoneAt: [2] }),
    ...tasksInSection(2, ['Initial disclosures (FRCP 26)', 'Preservation hold', 'Document requests (set 1)', 'Interrogatories (set 1)', 'RFAs', 'Subpoenas', 'Receive opposing docs', 'Privilege log', 'Depositions — plaintiff', 'Depositions — defendant', 'Expert disclosures'], { startDay: 30, role: 'Discovery team', milestoneAt: [10] }),
    ...tasksInSection(3, ['Motion to dismiss', 'Motion to compel', 'MSJ', 'Motions in limine', 'Daubert challenges'], { startDay: 90, role: 'Associate' }),
    ...tasksInSection(4, ['Trial brief', 'Witness list & order', 'Exhibit binders', 'Jury instructions', 'Voir dire questions', 'Mock trial', 'Settlement conference'], { startDay: 120, role: 'Partner', milestoneAt: [6] }),
    ...tasksInSection(5, ['Opening statement', 'Direct & cross', 'Close', 'Verdict'], { startDay: 150, role: 'Trial team', milestoneAt: [3] }),
    ...tasksInSection(6, ['Post-trial motions', 'Notice of appeal', 'Cost bill', 'Judgment satisfaction'], { startDay: 160, role: 'Associate' }),
    ...tasksInSection(7, ['Final invoice', 'Final report to client', 'Archive matter'], { startDay: 180, role: 'Admin' }),
  ],
  ruleTemplates: [
    { name: 'Discovery deadline critical', enabled: true, trigger: { type: 'task_due_in_days', days: 14 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Discovery deadline in 14 days' }], runCount: 0 },
    { name: 'Trial partner required', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: 'trial' }, conditions: [], actions: [{ type: 'add_collaborator', userId: 'partner' }], runCount: 0 },
  ],
})

export const contractReviewTemplate = defineTemplate({
  id: 'c3-contract-review',
  name: 'Contract Review & Negotiation',
  description: 'Contract lifecycle from intake through CLM storage.',
  category: 'Law',
  iconEmoji: '📝',
  color: 'primary',
  defaultView: 'board',
  sectionNames: ['Intake', 'First-pass review', 'Internal redlines', 'Counterparty negotiation', 'Approvals', 'Signature', 'Storage'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Counterparty', type: 'text' },
    { name: 'Contract type', type: 'dropdown', options: enumOptions([{ label: 'MSA', color: 'blue' }, { label: 'NDA', color: 'gray' }, { label: 'SOW', color: 'purple' }, { label: 'DPA', color: 'teal' }, { label: 'License', color: 'amber' }]) },
    { name: 'Contract value', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Risk rating', type: 'dropdown', options: enumOptions([{ label: 'Low', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'High', color: 'danger' }]) },
    { name: 'Auto-renew?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Receive request', 'Confirm counterparty info', 'Assign reviewer', 'Set deadline'], { role: 'Legal ops' }),
    ...tasksInSection(1, ['Confirm contract type & playbook', 'Identify deviations', 'Draft risk memo'], { startDay: 1, role: 'Attorney' }),
    ...tasksInSection(2, ['Mark up track changes', 'Business owner sign-off', 'Legal sign-off'], { startDay: 3, role: 'Attorney' }),
    ...tasksInSection(3, ['Send redlines', 'Discussion call', 'Receive counter markup', 'Reconcile changes'], { startDay: 5, role: 'Attorney' }),
    ...tasksInSection(4, ['Route approval chain', 'Capture approval evidence'], { startDay: 10, role: 'Legal ops' }),
    ...tasksInSection(5, ['Send via e-sign', 'Confirm signatures', 'Effective date'], { startDay: 12, role: 'Legal ops' }),
    ...tasksInSection(6, ['Save executed PDF to CLM', 'Tag metadata', 'Calendar renewal reminders'], { startDay: 13, role: 'Legal ops' }),
  ],
  ruleTemplates: [
    { name: 'High risk approvers', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'risk-rating' }, conditions: [{ field: 'risk-rating', op: 'eq', value: 'High' }], actions: [{ type: 'add_collaborator', userId: 'gc' }], runCount: 0 },
    { name: 'Signed notify owner', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Contract executed' }], runCount: 0 },
  ],
})

export const maClosingTemplate = defineTemplate({
  id: 'c4-ma-closing',
  name: 'M&A Deal Closing Checklist',
  description: 'Legal M&A closing checklist from LOI through post-closing.',
  category: 'Law',
  iconEmoji: '🏛️',
  color: 'primary',
  defaultView: 'gantt',
  sectionNames: ['Pre-LOI', 'Due diligence', 'Definitive agreement', 'Regulatory & financing', 'Pre-closing deliverables', 'Closing', 'Post-closing'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Workstream', type: 'dropdown', options: enumOptions([{ label: 'Legal', color: 'blue' }, { label: 'Tax', color: 'amber' }, { label: 'HR', color: 'teal' }, { label: 'IT', color: 'purple' }, { label: 'Regulatory', color: 'rose' }]) },
    { name: 'Critical path?', type: 'checkbox' },
    { name: 'Deliverable status', type: 'dropdown', options: enumOptions([{ label: 'Not started', color: 'gray' }, { label: 'In drafting', color: 'blue' }, { label: 'Agreed', color: 'accent' }, { label: 'Signed', color: 'accent' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['NDA executed', 'Initial info exchange', 'Indicative offer', 'Exclusivity agreement'], { role: 'Corp Dev' }),
    ...tasksInSection(1, ['Open data room', 'Diligence request list', 'Legal DD memo', 'Financial DD memo', 'Tax DD memo', 'HR DD memo', 'IT DD memo', 'Commercial DD', 'IP DD', 'Insurance DD', 'Litigation review', 'FCPA review'], { startDay: 7, role: 'Deal team' }),
    ...tasksInSection(2, ['Purchase agreement drafted', 'Disclosure schedules', 'R&W insurance bound', 'Working capital methodology', 'Escrow agreement', 'Non-compete terms', 'Key employee agreements'], { startDay: 30, role: 'Legal' }),
    ...tasksInSection(3, ['HSR filing', 'EU/UK antitrust', 'CFIUS notification', 'Financing commitments', 'Solvency opinions'], { startDay: 45, role: 'Regulatory' }),
    ...tasksInSection(4, ['Bring-down certificates', 'Officer certificates', 'Good standing certs', 'Lien searches', 'Third-party consents', 'Funds flow schedule'], { startDay: 60, role: 'Legal' }),
    ...tasksInSection(5, ['Execute closing documents', 'Funds flow executed', 'Wire confirmations', 'Closing book', 'Press release'], { startDay: 75, role: 'Deal lead', milestoneAt: [0, 1] }),
    ...tasksInSection(6, ['8-K filing', 'Update entity records', 'Integration kickoff', 'TSA execution', 'Working capital true-up', 'Earn-out tracking'], { startDay: 76, role: 'Corp Dev' }),
  ],
  ruleTemplates: [
    { name: 'Critical path slip', enabled: true, trigger: { type: 'task_due_in_days', days: 1 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Critical path task overdue' }], runCount: 0 },
    { name: 'Closing enables post-close', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'post-closing' }], runCount: 0 },
  ],
  relatedTemplateIds: ['g1-strategic-acquisition'],
})

export const LAW_TEMPLATES: CuratedProjectTemplate[] = [
  matterIntakeTemplate,
  litigationTemplate,
  contractReviewTemplate,
  maClosingTemplate,
]
