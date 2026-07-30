/** Curated rule templates — read-only presets users instantiate into editable rules. */
import { ROUND_ROBIN_USER_ID, ASSIGNEE_USER_ID } from '../../lib/rulesEngine'
import type { Rule, RuleAction, RuleTrigger } from '../../types'

export type RuleTemplate = {
  id: string
  name: string
  description: string
  trigger: RuleTrigger
  conditions: Rule['conditions']
  actions: RuleAction[]
}

/** Platform rule library shipped with Tasklytic. */
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'triage-incoming',
    name: 'Triage incoming requests',
    description: 'Form submission → assign, set priority, move to triage section.',
    trigger: { type: 'form_submitted', formId: '' },
    conditions: [],
    actions: [
      { type: 'assign_to', userId: '' },
      { type: 'set_custom_field', customFieldId: '', value: '' },
      { type: 'move_to_section', sectionId: '' },
    ],
  },
  {
    id: 'daily-reminder',
    name: 'Daily reminder',
    description: 'Notify assignee when a task is due in 1 day.',
    trigger: { type: 'task_due_in_days', days: 1 },
    conditions: [],
    actions: [{ type: 'send_notification', userId: ASSIGNEE_USER_ID, message: '"{{taskName}}" is due tomorrow' }],
  },
  {
    id: 'move-completed-done',
    name: 'Move completed to Done',
    description: 'When a task is completed, move it to the Done section.',
    trigger: { type: 'task_completed' },
    conditions: [],
    actions: [{ type: 'move_to_section', sectionId: '' }],
  },
  {
    id: 'approval-workflow',
    name: 'Approval workflow',
    description: 'When moved to Ready for approval, assign to approver.',
    trigger: { type: 'task_moved_to_section', sectionId: '' },
    conditions: [],
    actions: [{ type: 'assign_to', userId: '' }],
  },
  {
    id: 'round-robin',
    name: 'Round-robin assignment',
    description: 'Distribute new tasks evenly among project members.',
    trigger: { type: 'task_added_to_project' },
    conditions: [],
    actions: [{ type: 'assign_to', userId: ROUND_ROBIN_USER_ID }],
  },
  {
    id: 'at-risk-status',
    name: 'On at-risk status change',
    description: 'Notify project owner when Status becomes At Risk.',
    trigger: { type: 'custom_field_changed', customFieldId: '', toValue: '' },
    conditions: [],
    actions: [
      { type: 'send_notification', userId: '', message: '"{{taskName}}" is at risk' },
    ],
  },
]
