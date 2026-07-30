/**
 * F. HR / People templates (F1–F4).
 */
import { defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

export const talentAcquisitionTemplate = defineTemplate({
  id: 'f1-talent-acquisition',
  name: 'Talent Acquisition — Req to Hire',
  description: 'Recruiting pipeline from req approval through offer acceptance.',
  category: 'HR',
  iconEmoji: '🧑‍💼',
  color: 'primary',
  defaultView: 'board',
  sectionNames: ['Req approval', 'Sourcing', 'Recruiter screen', 'Hiring manager screen', 'Panel / Onsite', 'Debrief & decision', 'Offer', 'Background check', 'Accepted', 'Declined / Rejected'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Role', type: 'text' },
    { name: 'Hiring manager', type: 'people' },
    { name: 'Recruiter', type: 'people' },
    { name: 'Source', type: 'dropdown', options: enumOptions([{ label: 'Inbound', color: 'blue' }, { label: 'Referral', color: 'accent' }, { label: 'Agency', color: 'purple' }, { label: 'LinkedIn', color: 'teal' }]) },
    { name: 'Offer amount', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Diversity slate?', type: 'checkbox' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    { name: 'Maya P. — Senior Product Designer', sectionIndex: 3, assigneeRole: 'Recruiter', notes: 'Source: Referral' },
    { name: 'Theo R. — Backend Engineer III', sectionIndex: 4, assigneeRole: 'Recruiter', notes: 'Source: Inbound' },
    { name: 'Jordan K. — FP&A Analyst', sectionIndex: 2, assigneeRole: 'Recruiter', notes: 'Source: Agency' },
    ...tasksInSection(0, ['New role request approved', 'Job description review', 'Comp band confirmed'], { role: 'Recruiting' }),
    ...tasksInSection(1, ['Sourcing plan', 'Post role', 'Initial outreach pipeline'], { role: 'Recruiter' }),
    ...tasksInSection(6, ['Offer prep', 'Comp benchmarking', 'Offer extended'], { role: 'Recruiter' }),
    ...tasksInSection(7, ['Background check initiated', 'References complete'], { role: 'Recruiting ops' }),
  ],
  ruleTemplates: [
    { name: 'Offer notify Finance', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: 'offer' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Offer stage — Finance alignment' }], runCount: 0 },
    { name: 'Accepted spawns onboarding', enabled: true, trigger: { type: 'task_moved_to_section', sectionId: 'accepted' }, conditions: [], actions: [{ type: 'add_to_project', projectId: 'onboarding' }], runCount: 0 },
  ],
  relatedTemplateIds: ['f2-new-hire-onboarding'],
})

export const newHireOnboardingHrTemplate = defineTemplate({
  id: 'f2-new-hire-onboarding',
  name: 'New Hire Onboarding — Day 0 to Day 90',
  description: 'HR onboarding from offer signed through 90-day review.',
  category: 'HR',
  iconEmoji: '👋',
  color: 'accent',
  defaultView: 'timeline',
  sectionNames: ['Pre-start (Offer signed → Day 0)', 'Day 1', 'Week 1', 'Weeks 2–4', 'Month 2', 'Month 3 (30-60-90 review)'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Employee name', type: 'text' },
    { name: 'Start date', type: 'date' },
    { name: 'Manager', type: 'people' },
    { name: 'Buddy', type: 'people' },
    { name: 'Equipment status', type: 'dropdown', options: enumOptions([{ label: 'Not ordered', color: 'gray' }, { label: 'Ordered', color: 'blue' }, { label: 'Shipped', color: 'warning' }, { label: 'Received', color: 'accent' }]) },
    { name: 'I-9 status', type: 'dropdown', options: enumOptions([{ label: 'Not started', color: 'gray' }, { label: 'Section 1', color: 'blue' }, { label: 'Section 2 verified', color: 'accent' }]) },
    { name: 'Benefits enrolled?', type: 'checkbox' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Send welcome packet', 'Order equipment', 'Provision IT accounts', 'Building access / remote stipend', 'Add to org chart', 'Manager prep first-week plan', 'I-9 Section 1 & compliance docs', 'Add to Slack channels'], { role: 'People Ops' }),
    ...tasksInSection(1, ['Welcome session (HR & IT)', 'Manager 1:1', 'Buddy intro', 'I-9 Section 2 verification', 'Tour / remote orientation'], { startDay: 0, role: 'Manager', milestoneAt: [3] }),
    ...tasksInSection(2, ['Role training kickoff', 'Team intros', 'Daily manager 1:1s', 'Security training', 'Privacy training', 'Benefits 1:1', 'Tooling deep dive'], { startDay: 1, role: 'Manager' }),
    ...tasksInSection(3, ['First small deliverable', 'Cross-functional intros', 'Product overview', 'Optional ERG intros'], { startDay: 7, role: 'Manager' }),
    ...tasksInSection(4, ['30-day check-in', '30-day People Ops survey', 'Mid-ramp project assignment'], { startDay: 30, role: 'Manager', milestoneAt: [0] }),
    ...tasksInSection(5, ['60-day check-in', '90-day review', 'Probation close', 'Confirm deliverables'], { startDay: 60, role: 'Manager', milestoneAt: [1] }),
  ],
  ruleTemplates: [
    { name: 'Pre-start at T-14', enabled: true, trigger: { type: 'task_due_in_days', days: 14 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Pre-start automation kickoff' }], runCount: 0 },
    { name: 'Equipment delay', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'equipment-status' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Equipment not received' }], runCount: 0 },
  ],
})

export const performanceReviewTemplate = defineTemplate({
  id: 'f3-performance-review',
  name: 'Performance Review Cycle',
  description: 'Semi-annual performance review from setup through delivery.',
  category: 'HR',
  iconEmoji: '⭐',
  color: 'indigo',
  defaultView: 'list',
  recurring: 'Semi-annual',
  sectionNames: ['Cycle setup', 'Self-review', 'Manager review', 'Peer / Upward feedback', 'Calibration', 'Compensation decisions', 'Delivery (1:1s)', 'Wrap-up'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Employee', type: 'people' },
    { name: 'Manager', type: 'people' },
    { name: 'Level', type: 'dropdown', options: enumOptions([{ label: 'IC1', color: 'gray' }, { label: 'IC3', color: 'blue' }, { label: 'IC5', color: 'purple' }, { label: 'M2', color: 'teal' }]) },
    { name: 'Rating (proposed)', type: 'dropdown', options: enumOptions([{ label: 'Exceeds', color: 'accent' }, { label: 'Meets', color: 'blue' }, { label: 'Below', color: 'danger' }]) },
    { name: 'Promotion eligible?', type: 'checkbox' },
    { name: 'Comp recommendation', type: 'number', numberFormat: 'percent' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Define cycle dates', 'Calibration philosophy', 'Manager training', 'Comp guardrails', 'Launch communications'], { role: 'People Ops' }),
    ...tasksInSection(1, ['Self-review launched', 'Reminders sent', 'Late list tracked'], { startDay: 7, role: 'People Ops' }),
    ...tasksInSection(2, ['Manager review launched', 'Calibration training', 'Coaching for new managers'], { startDay: 14, role: 'People Ops' }),
    ...tasksInSection(3, ['Solicit peer feedback', 'Aggregate feedback', 'Make available to managers'], { startDay: 14, role: 'People Ops' }),
    ...tasksInSection(4, ['Department calibration', 'Cross-dept calibration', 'Adjustments tracked'], { startDay: 21, role: 'HRBP' }),
    ...tasksInSection(5, ['Comp recommendations', 'Budget reconciliation', 'Comp committee approval', 'Equity refresh decisions'], { startDay: 28, role: 'Comp team' }),
    ...tasksInSection(6, ['Generate comp letters', 'Train managers on delivery', 'Schedule 1:1s', 'Deliver reviews', 'HR escalation support'], { startDay: 35, role: 'Managers' }),
    ...tasksInSection(7, ['Post-cycle survey', 'Lessons learned', 'Update next-cycle plan'], { startDay: 42, role: 'People Ops' }),
  ],
  ruleTemplates: [
    { name: 'Self-review reminder', enabled: true, trigger: { type: 'task_due_in_days', days: 2 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Self-review due soon' }], runCount: 0 },
    { name: 'Promotion decision required', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'promotion-eligible' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Promotion eligibility flagged' }], runCount: 0 },
  ],
})

export const openEnrollmentTemplate = defineTemplate({
  id: 'f4-open-enrollment',
  name: 'Open Enrollment',
  description: 'Annual benefits open enrollment from vendor selection through wrap-up.',
  category: 'HR',
  iconEmoji: '🩺',
  color: 'info',
  defaultView: 'gantt',
  recurring: 'Annual',
  sectionNames: ['Vendor selection & renewals', 'Plan design', 'Communications planning', 'System setup', 'Enrollment window', 'Confirmation & file feeds', 'Post-OE wrap-up'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Plan type', type: 'dropdown', options: enumOptions([{ label: 'Medical', color: 'blue' }, { label: 'Dental', color: 'teal' }, { label: 'Vision', color: 'purple' }, { label: '401(k)', color: 'amber' }]) },
    { name: 'Carrier', type: 'text' },
    { name: 'Plan year', type: 'number' },
    { name: 'Premium change %', type: 'number', numberFormat: 'percent' },
    { name: 'Enrollment rate', type: 'number', numberFormat: 'percent' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['RFP non-renewing carriers', 'Broker market review', 'Negotiate renewals', 'Approve final lineup'], { role: 'Benefits' }),
    ...tasksInSection(1, ['Plan changes for next year', 'Contribution strategy', 'HDHP / HSA strategy', 'Network adequacy', 'Compliance reviews (ACA, MHPAEA)'], { startDay: 14, role: 'Benefits' }),
    ...tasksInSection(2, ['Communication calendar', 'Build benefits guide', 'Decision tools', 'Schedule town halls', 'FAQ'], { startDay: 21, role: 'Comms' }),
    ...tasksInSection(3, ['Configure HRIS OE module', 'Build new plans / rates', 'Test enrollment E2E', 'Configure carrier 834 feeds'], { startDay: 28, role: 'Benefits ops' }),
    ...tasksInSection(4, ['Launch enrollment', 'Town halls', 'Daily reminders', 'Weekly progress reports', 'Questions queue'], { startDay: 35, role: 'Benefits', milestoneAt: [0] }),
    ...tasksInSection(5, ['Close enrollment', 'Confirmation statements', 'Reconcile elections', 'Generate carrier files', 'Update payroll deductions'], { startDay: 42, role: 'Benefits ops', milestoneAt: [0] }),
    ...tasksInSection(6, ['Year-end testing reminders', 'New plan year comms', 'QLE monitoring', 'Post-mortem'], { startDay: 49, role: 'Benefits' }),
  ],
  ruleTemplates: [
    { name: 'Low enrollment rate', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'enrollment-rate' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Enrollment rate below 60%' }], runCount: 0 },
    { name: 'Close locks HRIS', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Open enrollment closed' }], runCount: 0 },
  ],
})

export const HR_TEMPLATES: CuratedProjectTemplate[] = [
  talentAcquisitionTemplate,
  newHireOnboardingHrTemplate,
  performanceReviewTemplate,
  openEnrollmentTemplate,
]
