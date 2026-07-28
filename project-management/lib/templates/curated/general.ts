/**
 * Step 27 — eight platform curated templates (non-persisted fixtures).
 */
import { defineTemplate, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

/** Product launch — Plan / Build / Launch / Measure. */
export const productLaunchTemplate = defineTemplate({
  id: 'curated-product-launch',
  name: 'Product launch',
  description: 'Cross-functional launch from planning through measurement.',
  category: 'General',
  iconEmoji: '🚀',
  color: 'primary',
  defaultView: 'board',
  suggestedBundles: ['Status field', 'Priority field'],
  sectionNames: ['Plan', 'Build', 'Launch', 'Measure'],
  customFieldIds: [],
  recommendedFields: [
    ...withGlobalStatusPriority(),
    { name: 'Effort', type: 'dropdown', options: [{ label: 'Small', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'Large', color: 'danger' }] },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Define launch goals & KPIs', 'Stakeholder alignment', 'Risk register', 'Launch calendar draft'], { startDay: 0, role: 'PM' }),
    ...tasksInSection(1, ['Finalize scope', 'Engineering build complete', 'QA sign-off', 'Docs & enablement ready'], { startDay: 7, role: 'Eng lead' }),
    ...tasksInSection(2, ['Go/no-go review', 'Launch communications', 'Release to production', 'War room monitoring'], { startDay: 14, role: 'Launch lead', milestoneAt: [2] }),
    ...tasksInSection(3, ['Week-1 metrics review', 'Customer feedback synthesis', 'Retro & learnings'], { startDay: 21, role: 'PM' }),
  ],
  ruleTemplates: [
    { name: 'At-risk notify owner', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'status' }, conditions: [{ field: 'status', op: 'eq', value: 'At risk' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Launch status is at risk' }], runCount: 0 },
    { name: 'Launch complete update', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Launch milestone completed' }], runCount: 0 },
  ],
})

export const marketingCampaignTemplate = defineTemplate({
  id: 'curated-marketing-campaign',
  name: 'Marketing campaign',
  description: 'Strategy through analysis for a multi-channel campaign.',
  category: 'General',
  iconEmoji: '📣',
  color: 'accent',
  defaultView: 'board',
  sectionNames: ['Strategy', 'Assets', 'Distribution', 'Analyze'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Channel', type: 'dropdown', options: [{ label: 'Email', color: 'blue' }, { label: 'Social', color: 'purple' }, { label: 'Paid', color: 'amber' }, { label: 'Events', color: 'rose' }] },
    { name: 'Owner', type: 'people' },
    { name: 'Due', type: 'date' },
    { name: 'Cost', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Campaign brief', 'Audience definition', 'Budget approval', 'Channel mix'], { role: 'Marketing lead' }),
    ...tasksInSection(1, ['Creative brief', 'Copy & design', 'Landing page', 'Email templates'], { startDay: 3, role: 'Creative' }),
    ...tasksInSection(2, ['Schedule sends', 'Paid media live', 'Influencer outreach', 'Launch day checklist'], { startDay: 10, role: 'Ops' }),
    ...tasksInSection(3, ['Performance dashboard', 'ROI analysis', 'Stakeholder readout'], { startDay: 21, role: 'Analytics' }),
  ],
  ruleTemplates: [
    { name: 'Over budget alert', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'cost' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Campaign cost updated' }], runCount: 0 },
    { name: 'Asset ready', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'distribution' }], runCount: 0 },
  ],
})

export const editorialCalendarTemplate = defineTemplate({
  id: 'curated-editorial-calendar',
  name: 'Editorial calendar',
  description: 'Content pipeline from pitch through publish.',
  category: 'General',
  iconEmoji: '✍️',
  color: 'teal',
  defaultView: 'board',
  sectionNames: ['Pitched', 'Drafting', 'Editing', 'Published'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Author', type: 'people' },
    { name: 'Publish date', type: 'date' },
    { name: 'Channel', type: 'dropdown', options: [{ label: 'Blog', color: 'blue' }, { label: 'Newsletter', color: 'purple' }, { label: 'Social', color: 'rose' }] },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Q1 topic brainstorm', 'Assign authors', 'Approve pitches'], { role: 'Editor' }),
    ...tasksInSection(1, ['First drafts', 'Expert review', 'SEO optimization'], { startDay: 5, role: 'Author' }),
    ...tasksInSection(2, ['Copy edit', 'Legal review', 'Final approval'], { startDay: 10, role: 'Editor' }),
    ...tasksInSection(3, ['Schedule publish', 'Promote on channels', 'Archive & tag'], { startDay: 14, role: 'Ops' }),
  ],
  ruleTemplates: [
    { name: 'Draft to editing', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'editing' }], runCount: 0 },
    { name: 'Publish reminder', enabled: true, trigger: { type: 'task_due_in_days', days: 1 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Publish date tomorrow' }], runCount: 0 },
  ],
})

export const engineeringSprintTemplate = defineTemplate({
  id: 'curated-engineering-sprint',
  name: 'Engineering sprint',
  description: 'Two-week agile sprint workflow.',
  category: 'General',
  iconEmoji: '💻',
  color: 'indigo',
  defaultView: 'board',
  sectionNames: ['Backlog', 'In progress', 'Review', 'Done'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Story points', type: 'number' },
    { name: 'Type', type: 'dropdown', options: [{ label: 'Feature', color: 'accent' }, { label: 'Bug', color: 'danger' }, { label: 'Chore', color: 'gray' }] },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Groom backlog', 'Define sprint goal', 'Capacity planning'], { role: 'Scrum master' }),
    ...tasksInSection(1, ['Implement stories', 'Pair on blockers', 'Daily standups'], { startDay: 1, role: 'Engineer' }),
    ...tasksInSection(2, ['Code review', 'QA verification', 'Demo prep'], { startDay: 8, role: 'Tech lead' }),
    ...tasksInSection(3, ['Sprint demo', 'Retro action items', 'Release notes'], { startDay: 10, role: 'PM' }),
  ],
  ruleTemplates: [
    { name: 'Blocked notify lead', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'status' }, conditions: [{ field: 'status', op: 'eq', value: 'Off track' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Sprint item off track' }], runCount: 0 },
    { name: 'Review on complete', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'review' }], runCount: 0 },
  ],
})

export const newHireOnboardingTemplate = defineTemplate({
  id: 'curated-new-hire-onboarding',
  name: 'Onboarding (new hire)',
  description: 'Employee onboarding from pre-day-1 through month 3.',
  category: 'General',
  iconEmoji: '👋',
  color: 'accent',
  defaultView: 'timeline',
  sectionNames: ['Pre-day-1', 'Week 1', 'Month 1', 'Month 3'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Owner', type: 'people' },
    { name: 'Done', type: 'checkbox' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Send welcome packet', 'Order equipment', 'Provision accounts', 'I-9 paperwork'], { role: 'HR' }),
    ...tasksInSection(1, ['Day-1 orientation', 'Manager 1:1', 'Buddy intro', 'Security training'], { startDay: 1, role: 'Manager' }),
    ...tasksInSection(2, ['30-day check-in', 'First deliverable', 'Team intros complete'], { startDay: 14, role: 'Manager' }),
    ...tasksInSection(3, ['90-day review', 'Probation close', 'Career conversation'], { startDay: 60, role: 'HR', milestoneAt: [0] }),
  ],
  ruleTemplates: [
    { name: 'Equipment delay', enabled: true, trigger: { type: 'task_due_in_days', days: 3 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Onboarding task due soon' }], runCount: 0 },
    { name: 'Mark done', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'set_custom_field', customFieldId: 'done', value: true }], runCount: 0 },
  ],
})

export const bugTrackerTemplate = defineTemplate({
  id: 'curated-bug-tracker',
  name: 'Bug tracker',
  description: 'Triage through verification workflow.',
  category: 'General',
  iconEmoji: '🐛',
  color: 'danger',
  defaultView: 'board',
  sectionNames: ['Triage', 'In progress', 'Verifying', 'Closed'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Severity', type: 'dropdown', options: [{ label: 'Critical', color: 'danger' }, { label: 'Major', color: 'warning' }, { label: 'Minor', color: 'gray' }] },
    { name: 'Reporter', type: 'people' },
    { name: 'Steps to reproduce', type: 'text' },
    { name: 'Build version', type: 'text' },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Reproduce issue', 'Assign severity', 'Route to team'], { role: 'Triage' }),
    ...tasksInSection(1, ['Root cause analysis', 'Implement fix', 'Unit tests'], { startDay: 1, role: 'Engineer' }),
    ...tasksInSection(2, ['QA verification', 'Regression pass', 'Stakeholder sign-off'], { startDay: 5, role: 'QA' }),
    ...tasksInSection(3, ['Deploy fix', 'Update release notes', 'Close ticket'], { startDay: 7, role: 'Release' }),
  ],
  ruleTemplates: [
    { name: 'Critical escalate', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'severity' }, conditions: [{ field: 'severity', op: 'eq', value: 'Critical' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'Critical bug filed' }], runCount: 0 },
    { name: 'Auto-close verified', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'closed' }], runCount: 0 },
  ],
})

export const eventPlanningTemplate = defineTemplate({
  id: 'curated-event-planning',
  name: 'Event planning',
  description: 'Corporate event pre, day-of, and post.',
  category: 'General',
  iconEmoji: '🎪',
  color: 'warning',
  defaultView: 'list',
  sectionNames: ['Pre', 'Day-of', 'Post'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Vendor', type: 'text' },
    { name: 'Cost', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Define objectives', 'Set budget', 'Book venue', 'Catering RFP', 'Speaker confirmations'], { role: 'Event lead' }),
    ...tasksInSection(1, ['Run of show', 'AV check', 'Registration desk', 'Live social coverage'], { startDay: 30, role: 'Ops', milestoneAt: [2] }),
    ...tasksInSection(2, ['Thank-you notes', 'Survey send', 'Budget reconciliation', 'Retro'], { startDay: 31, role: 'Event lead' }),
  ],
  ruleTemplates: [
    { name: 'Budget threshold', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'cost' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Event cost updated' }], runCount: 0 },
    { name: 'Post-event tasks', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'move_to_section', sectionId: 'post' }], runCount: 0 },
  ],
})

export const okrPlanningTemplate = defineTemplate({
  id: 'curated-okr-planning',
  name: 'OKR planning',
  description: 'Quarterly objectives and key results rollout.',
  category: 'General',
  iconEmoji: '🎯',
  color: 'primary',
  defaultView: 'timeline',
  sectionNames: ['Q1', 'Q2', 'Q3', 'Q4'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Objective', type: 'text' },
    { name: 'KR', type: 'text' },
    { name: 'Confidence', type: 'dropdown', options: [{ label: 'High', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'Low', color: 'danger' }] },
  ],
  taskSpecs: [
    ...tasksInSection(0, ['Draft company OKRs', 'Department alignment', 'Publish Q1 OKRs', 'Weekly check-ins'], { role: 'Chief of Staff' }),
    ...tasksInSection(1, ['Mid-quarter review', 'Adjust KRs', 'Publish Q2 OKRs'], { startDay: 90, role: 'Chief of Staff' }),
    ...tasksInSection(2, ['Q3 planning workshop', 'Cross-functional sync', 'Publish Q3 OKRs'], { startDay: 180, role: 'Chief of Staff' }),
    ...tasksInSection(3, ['Year-end scoring', 'Annual retro', 'Publish Q4 OKRs'], { startDay: 270, role: 'Chief of Staff', milestoneAt: [0] }),
  ],
  ruleTemplates: [
    { name: 'Low confidence', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'confidence' }, conditions: [{ field: 'confidence', op: 'eq', value: 'Low' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'OKR confidence is low' }], runCount: 0 },
    { name: 'Quarter rollover', enabled: true, trigger: { type: 'task_completed' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Quarter OKR cycle complete' }], runCount: 0 },
  ],
})

export const GENERAL_TEMPLATES: CuratedProjectTemplate[] = [
  productLaunchTemplate,
  marketingCampaignTemplate,
  editorialCalendarTemplate,
  engineeringSprintTemplate,
  newHireOnboardingTemplate,
  bugTrackerTemplate,
  eventPlanningTemplate,
  okrPlanningTemplate,
]
