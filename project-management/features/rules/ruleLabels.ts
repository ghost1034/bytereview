/** Display labels for rule triggers, conditions, and actions. */
import { ROUND_ROBIN_USER_ID, ASSIGNEE_USER_ID } from '../../lib/rulesEngine'
import type { Rule, RuleAction, RuleTrigger } from '../../types'
import { useFormsStore, useProjectsStore, useSectionsStore, useUsersStore } from '../../stores/entities'

/** Short trigger label for cards and summaries. */
export function triggerLabel(trigger: RuleTrigger, projectId: string): string {
  switch (trigger.type) {
    case 'task_added_to_project':
      return 'Task added to project'
    case 'task_moved_to_section': {
      const name = useSectionsStore.getState().getById(trigger.sectionId)?.name ?? 'section'
      return `Moved to "${name}"`
    }
    case 'task_completed':
      return 'Task completed'
    case 'task_due_in_days':
      return `Due in ${trigger.days} day(s)`
    case 'custom_field_changed':
      return 'Custom field changed'
    case 'form_submitted': {
      const form = useFormsStore.getState().getById(trigger.formId)
      return `Form "${form?.name ?? 'submitted'}"`
    }
  }
}

/** Action label with resolved names. */
export function actionLabel(action: RuleAction): string {
  const users = useUsersStore.getState()
  const sections = useSectionsStore.getState()
  const projects = useProjectsStore.getState()

  switch (action.type) {
    case 'assign_to':
      if (action.userId === ROUND_ROBIN_USER_ID) return 'Round-robin assign'
      return `Assign to ${users.getById(action.userId)?.name ?? 'user'}`
    case 'set_due_in_days':
      return `Due in ${action.days} days`
    case 'move_to_section':
      return `Move to ${sections.getById(action.sectionId)?.name ?? 'section'}`
    case 'add_to_project':
      return `Add to ${projects.getById(action.projectId)?.name ?? 'project'}`
    case 'set_custom_field':
      return 'Set custom field'
    case 'add_collaborator':
      return `Add ${users.getById(action.userId)?.name ?? 'collaborator'}`
    case 'send_notification':
      if (action.userId === ASSIGNEE_USER_ID) return 'Notify assignee'
      return `Notify ${users.getById(action.userId)?.name ?? 'user'}`
    case 'create_subtask':
      return `Create subtask "${action.templateName}"`
  }
}

/** One-line summary with pill-friendly segments. */
export function ruleSummaryParts(rule: Rule): { trigger: string; conditions: string; actions: string[] } {
  const conditions =
    rule.conditions.length > 0
      ? rule.conditions.map((c) => `${c.field} ${c.op} ${String(c.value)}`).join(' & ')
      : ''
  return {
    trigger: triggerLabel(rule.trigger, rule.projectId),
    conditions,
    actions: rule.actions.map(actionLabel),
  }
}
