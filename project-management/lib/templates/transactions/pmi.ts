/**
 * PMI sub-template — child project from G1 closing milestone.
 */
import { ALL_VIEWS, defineTemplate, enumOptions, tasksInSection, withGlobalStatusPriority } from '../builders'
import type { CuratedProjectTemplate } from '../types'

const workstreams = ['Strategy/Integration', 'Legal', 'Tax', 'Finance', 'HR/Org', 'IT', 'Commercial', 'Real Estate', 'Procurement', 'Risk', 'Communications']

export const pmiSubTemplate = defineTemplate({
  id: 'g1-pmi-subtemplate',
  name: 'Post-Merger Integration (Day 1 → Day 100)',
  description: 'Day-1 through Day-100 integration workstreams and synergy tracking.',
  category: 'Corporate Dev',
  iconEmoji: '🔗',
  color: 'indigo',
  defaultView: 'gantt',
  enabledViews: ALL_VIEWS,
  sectionNames: ['Day-1 Readiness', 'Day-30 Milestones', 'Day-60 Milestones', 'Day-90 Milestones', 'Day-100 Review & Replan', 'Year-1 Synergy Realization'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Workstream', type: 'dropdown', options: enumOptions(workstreams.map((w) => ({ label: w, color: 'blue' }))) },
    { name: 'Synergy target', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Synergy type', type: 'dropdown', options: enumOptions([{ label: 'Cost', color: 'blue' }, { label: 'Revenue', color: 'accent' }, { label: 'Capex', color: 'purple' }]) },
    { name: 'Stage gate', type: 'dropdown', options: enumOptions([{ label: 'Identified', color: 'gray' }, { label: 'Scoped', color: 'blue' }, { label: 'Approved', color: 'warning' }, { label: 'In-flight', color: 'purple' }, { label: 'Realized', color: 'accent' }]) },
    ...withGlobalStatusPriority(),
  ],
  taskSpecs: [
    ...workstreams.flatMap((ws, i) =>
      tasksInSection(0, [`${ws}: Day-1 readiness checkpoint`], { role: ws.split('/')[0], startDay: 0 + i })
    ),
    ...tasksInSection(0, ['IMO stood up', 'Steering committee cadence', 'Charter every workstream', 'Synergy taxonomy', 'Cultural integration plan'], { role: 'IMO' }),
    ...tasksInSection(1, ['Day-30 review'], { startDay: 30, role: 'Integration Lead', milestoneAt: [0] }),
    ...tasksInSection(2, ['Day-60 review'], { startDay: 60, role: 'Integration Lead', milestoneAt: [0] }),
    ...tasksInSection(3, ['Day-90 review'], { startDay: 90, role: 'Integration Lead', milestoneAt: [0] }),
    ...tasksInSection(4, ['Day-100 milestone & replan'], { startDay: 100, role: 'CEO Sponsor', milestoneAt: [0] }),
    ...tasksInSection(5, ['Q1 synergy report', 'Q2 synergy report', 'Q3 synergy report'], { startDay: 120, role: 'IMO', milestoneAt: [0, 1, 2] }),
  ],
  ruleTemplates: [
    { name: 'Stage gate dashboard', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'stage-gate' }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'Synergy stage gate updated' }], runCount: 0 },
    { name: 'Critical path escalate', enabled: true, trigger: { type: 'task_due_in_days', days: 1 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'PMI critical path slip' }], runCount: 0 },
  ],
})
