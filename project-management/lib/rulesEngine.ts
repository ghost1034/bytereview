/**
 * Rules engine — evaluate project rules on task events and execute actions.
 */
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { emitActivity } from './activity'
import { newId } from './ids'
import { createNotification } from './notifications'
import { createSubtask, updateTask } from './taskActions'
import { now } from './time'
import type { Rule, RuleAction, Task } from '../types'
import {
  useProjectsStore,
  useRulesStore,
  useSectionsStore,
  useTasksStore,
  useUsersStore,
} from '../stores/entities'

export const MAX_RULE_DEPTH = 3
export const RULE_COOLDOWN_MS = 250
export const ROUND_ROBIN_USER_ID = '__round_robin__'
export const ASSIGNEE_USER_ID = '__assignee__'

/** Events that can fire rule evaluation. */
export type RuleRunEvent =
  | { type: 'task_added_to_project'; projectId: string }
  | { type: 'task_moved_to_section'; projectId: string; sectionId: string }
  | { type: 'task_completed' }
  | { type: 'task_due_in_days' }
  | { type: 'custom_field_changed'; customFieldId: string; toValue?: unknown }
  | { type: 'form_submitted'; formId: string }

export type RuleTestResult = {
  matched: boolean
  triggerMatched: boolean
  conditionsMatched: boolean
  actionsWouldRun: RuleAction[]
  summary: string
}

export type RuleHistoryEntry = {
  id: string
  ruleId: string
  taskId: string
  taskName: string
  actionsApplied: string[]
  error?: string
  createdAt: string
}

const HISTORY_KEY = 'tasklytic:ruleHistory:v1'
const MAX_HISTORY = 50

let ruleDepth = 0
let engineActive = false
const recentRuns = new Map<string, number>()
const dailyRuns = new Set<string>()
const roundRobinIndex = new Map<string, number>()

/** Whether the engine is currently executing (skip nested taskAction hooks). */
export function isRuleEngineActive(): boolean {
  return engineActive || ruleDepth > 0
}

function runKey(ruleId: string, taskId: string): string {
  return `${ruleId}:${taskId}`
}

function isCooldown(ruleId: string, taskId: string): boolean {
  const last = recentRuns.get(runKey(ruleId, taskId)) ?? 0
  return Date.now() - last < RULE_COOLDOWN_MS
}

function stampRun(ruleId: string, taskId: string, daily = false): void {
  recentRuns.set(runKey(ruleId, taskId), Date.now())
  if (daily) {
    dailyRuns.add(`${ruleId}:${taskId}:${new Date().toISOString().slice(0, 10)}`)
  }
}

function isDailyCooldown(ruleId: string, taskId: string): boolean {
  return dailyRuns.has(`${ruleId}:${taskId}:${new Date().toISOString().slice(0, 10)}`)
}

function loadHistory(): RuleHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as RuleHistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveHistory(entries: RuleHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 500)))
}

/** Last 50 runs for a rule (newest first). */
export function getRuleHistory(ruleId: string): RuleHistoryEntry[] {
  return loadHistory()
    .filter((e) => e.ruleId === ruleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY)
}

function recordHistory(entry: Omit<RuleHistoryEntry, 'id' | 'createdAt'>): void {
  const row: RuleHistoryEntry = { ...entry, id: newId(), createdAt: now() }
  saveHistory([row, ...loadHistory()])
}

function rulesForProject(projectId: string): Rule[] {
  return useRulesStore
    .getState()
    .list()
    .filter((r) => r.enabled && r.projectId === projectId)
}

function taskFieldValue(task: Task, field: string): unknown {
  if (field.startsWith('customField:')) {
    const cfId = field.slice('customField:'.length)
    const wrapped = task.customFieldValues[cfId]
    if (!wrapped) return null
    if (wrapped.type === 'dropdown') return wrapped.value
    if (wrapped.type === 'multi_select') return wrapped.value
    if (wrapped.type === 'people') return wrapped.value
    return wrapped.value
  }
  if (field === 'priority' || field === 'status') {
    const cf = Object.entries(task.customFieldValues).find(([id]) => {
      const defs = useProjectsStore.getState().getById(task.projectIds[0] ?? '')
      return defs?.customFieldIds.includes(id)
    })
    void cf
    const match = Object.entries(task.customFieldValues).find(([, v]) => v.type === 'dropdown')
    return match?.[1]?.type === 'dropdown' ? match[1].value : null
  }
  if (field === 'assigneeId' || field === 'assignee') return task.assigneeId ?? null
  if (field === 'sectionId') {
    const pid = task.projectIds[0]
    return pid ? task.sectionIdByProject[pid] ?? null : null
  }
  if (field === 'projectId') return task.projectIds[0] ?? null
  if (field === 'tagIds') return task.tagIds
  if (field === 'collaboratorIds') return task.collaboratorIds
  return (task as Record<string, unknown>)[field]
}

function evalCondition(task: Task, field: string, op: string, value: unknown): boolean {
  const raw = taskFieldValue(task, field)

  if (field === 'due_within_days') {
    if (!task.dueOn) return false
    const days = Number(value)
    if (Number.isNaN(days)) return false
    const untilDue = differenceInCalendarDays(parseISO(task.dueOn), startOfDay(new Date()))
    return untilDue >= 0 && untilDue <= days
  }

  switch (op) {
    case 'eq':
      return raw === value
    case 'neq':
      return raw !== value
    case 'gt':
      return Number(raw) > Number(value)
    case 'lt':
      return Number(raw) < Number(value)
    case 'in':
      return Array.isArray(value) ? value.includes(raw) : false
    default:
      return false
  }
}

function matchesConditions(rule: Rule, task: Task): boolean {
  if (!rule.conditions.length) return true
  return rule.conditions.every((c) => evalCondition(task, c.field, c.op, c.value))
}

function matchesTrigger(rule: Rule, task: Task, event: RuleRunEvent): boolean {
  const t = rule.trigger
  switch (t.type) {
    case 'task_added_to_project':
      return event.type === 'task_added_to_project' && event.projectId === rule.projectId
    case 'task_moved_to_section':
      return (
        event.type === 'task_moved_to_section' &&
        event.projectId === rule.projectId &&
        event.sectionId === t.sectionId
      )
    case 'task_completed':
      return event.type === 'task_completed'
    case 'task_due_in_days':
      if (event.type !== 'task_due_in_days' || !task.dueOn || task.completed) return false
      const days = differenceInCalendarDays(parseISO(task.dueOn), startOfDay(new Date()))
      return days >= 0 && days <= t.days
    case 'custom_field_changed':
      if (event.type !== 'custom_field_changed' || event.customFieldId !== t.customFieldId) return false
      if (t.toValue === undefined) return true
      return event.toValue === t.toValue
    case 'form_submitted':
      return event.type === 'form_submitted' && event.formId === t.formId
    default:
      return false
  }
}

function interpolateSubtaskName(template: string, task: Task): string {
  const assignee = task.assigneeId
    ? useUsersStore.getState().getById(task.assigneeId)?.name ?? ''
    : ''
  const today = format(new Date(), 'yyyy-MM-dd')
  return template
    .replace(/\{\{taskName\}\}/g, task.name)
    .replace(/\{\{assigneeName\}\}/g, assignee)
    .replace(/\{\{today\}\}/g, today)
    .replace(/\{\{dueIn:(\d+)\}\}/g, (_, n) =>
      addDays(startOfDay(new Date()), Number(n)).toISOString().slice(0, 10)
    )
}

function resolveRoundRobinUserId(projectId: string, ruleId: string): string | undefined {
  const project = useProjectsStore.getState().getById(projectId)
  const members = project?.memberIds ?? []
  if (!members.length) return undefined
  const idx = roundRobinIndex.get(ruleId) ?? 0
  const userId = members[idx % members.length]
  roundRobinIndex.set(ruleId, idx + 1)
  return userId
}

async function applyAction(
  action: RuleAction,
  task: Task,
  rule: Rule,
  actorId: string
): Promise<string> {
  switch (action.type) {
    case 'assign_to': {
      const userId =
        action.userId === ROUND_ROBIN_USER_ID
          ? resolveRoundRobinUserId(rule.projectId, rule.id)
          : action.userId
      if (!userId) return 'assign_to (skipped)'
      await updateTask(task.id, { assigneeId: userId }, actorId)
      return `assign_to:${userId}`
    }
    case 'move_to_section': {
      await updateTask(
        task.id,
        { sectionIdByProject: { ...task.sectionIdByProject, [rule.projectId]: action.sectionId } },
        actorId
      )
      return `move_to_section:${action.sectionId}`
    }
    case 'set_due_in_days': {
      const due = addDays(startOfDay(new Date()), action.days)
      await updateTask(task.id, { dueOn: due.toISOString().slice(0, 10) }, actorId)
      return `set_due_in_days:${action.days}`
    }
    case 'set_custom_field': {
      const prev = task.customFieldValues[action.customFieldId]
      const type = prev?.type ?? 'text'
      const wrapped =
        type === 'text'
          ? { type: 'text' as const, value: String(action.value ?? '') }
          : type === 'number'
            ? { type: 'number' as const, value: Number(action.value) }
            : type === 'checkbox'
              ? { type: 'checkbox' as const, value: Boolean(action.value) }
              : type === 'dropdown'
                ? { type: 'dropdown' as const, value: String(action.value) }
                : prev ?? { type: 'text' as const, value: String(action.value ?? '') }
      await updateTask(
        task.id,
        { customFieldValues: { ...task.customFieldValues, [action.customFieldId]: wrapped } },
        actorId
      )
      return `set_custom_field:${action.customFieldId}`
    }
    case 'add_collaborator': {
      if (task.collaboratorIds.includes(action.userId)) return 'add_collaborator (noop)'
      await updateTask(task.id, { collaboratorIds: [...task.collaboratorIds, action.userId] }, actorId)
      return `add_collaborator:${action.userId}`
    }
    case 'add_to_project': {
      if (task.projectIds.includes(action.projectId)) return 'add_to_project (noop)'
      const project = useProjectsStore.getState().getById(action.projectId)
      const sectionId = project?.sectionIds[0]
      await updateTask(
        task.id,
        {
          projectIds: [...task.projectIds, action.projectId],
          sectionIdByProject: sectionId
            ? { ...task.sectionIdByProject, [action.projectId]: sectionId }
            : task.sectionIdByProject,
        },
        actorId
      )
      return `add_to_project:${action.projectId}`
    }
    case 'send_notification': {
      const userId =
        action.userId === ASSIGNEE_USER_ID ? task.assigneeId : action.userId
      if (!userId) return 'send_notification (skipped)'
      await createNotification({
        userId,
        actorId,
        type: 'rule_action',
        scope: { type: 'task', id: task.id },
        message: action.message.replace(/\{\{taskName\}\}/g, task.name),
        metadata: { ruleId: rule.id, taskName: task.name },
      })
      return 'send_notification'
    }
    case 'create_subtask': {
      const name = interpolateSubtaskName(action.templateName, task)
      await createSubtask(task.id, name, actorId)
      return 'create_subtask'
    }
    case 'send_email':
      return 'send_email (server job)'
    default:
      return 'unknown'
  }
}

async function runRule(
  rule: Rule,
  task: Task,
  actorId: string,
  dryRun: boolean,
  event?: RuleRunEvent
): Promise<{ applied: string[]; error?: string }> {
  const isDaily = event?.type === 'task_due_in_days' || rule.trigger.type === 'task_due_in_days'
  if (isDaily && isDailyCooldown(rule.id, task.id)) return { applied: [] }
  if (isCooldown(rule.id, task.id)) return { applied: [] }
  if (dryRun) {
    return { applied: rule.actions.map((a) => a.type) }
  }

  stampRun(rule.id, task.id, isDaily)
  const applied: string[] = []
  let error: string | undefined

  try {
    for (const action of rule.actions) {
      const fresh = useTasksStore.getState().getById(task.id)
      if (!fresh) break
      const label = await applyAction(action, fresh, rule, actorId)
      applied.push(label)
      emitActivity({
        taskId: task.id,
        projectId: rule.projectId,
        actorId,
        type: 'rule_action',
        details: { ruleId: rule.id, action: action.type, label },
      })
    }
    await useRulesStore.getState().update(rule.id, {
      runCount: rule.runCount + 1,
      lastRunAt: now(),
    })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Rule execution failed'
  }

  recordHistory({
    ruleId: rule.id,
    taskId: task.id,
    taskName: task.name,
    actionsApplied: applied,
    error,
  })

  return { applied, error }
}

/** Evaluate enabled rules for a task event. */
export async function runRulesForTask(
  event: RuleRunEvent,
  task: Task,
  actorId: string
): Promise<void> {
  if (ruleDepth >= MAX_RULE_DEPTH) {
    console.warn('[rulesEngine] Max depth reached; aborting to prevent loop')
    return
  }

  engineActive = true
  ruleDepth += 1
  try {
    const projectIds =
      event.type === 'task_added_to_project' || event.type === 'task_moved_to_section'
        ? [event.projectId]
        : task.projectIds

    for (const projectId of projectIds) {
      for (const rule of rulesForProject(projectId)) {
        if (!task.projectIds.includes(rule.projectId) && event.type !== 'task_added_to_project') {
          continue
        }
        if (!matchesTrigger(rule, task, event)) continue
        if (!matchesConditions(rule, task)) continue
        await runRule(rule, task, actorId, false, event)
      }
    }
  } finally {
    ruleDepth -= 1
    if (ruleDepth === 0) engineActive = false
  }
}

/** Dry-run a single rule against a task (no mutations). */
export function testRunRule(rule: Rule, task: Task, event?: RuleRunEvent): RuleTestResult {
  const ev: RuleRunEvent =
    event ??
    (rule.trigger.type === 'task_added_to_project'
      ? { type: 'task_added_to_project', projectId: rule.projectId }
      : rule.trigger.type === 'task_moved_to_section'
        ? {
            type: 'task_moved_to_section',
            projectId: rule.projectId,
            sectionId: rule.trigger.sectionId,
          }
        : rule.trigger.type === 'form_submitted'
          ? { type: 'form_submitted', formId: rule.trigger.formId }
          : rule.trigger.type === 'custom_field_changed'
            ? {
                type: 'custom_field_changed',
                customFieldId: rule.trigger.customFieldId,
                toValue: rule.trigger.toValue,
              }
            : rule.trigger.type === 'task_due_in_days'
              ? { type: 'task_due_in_days' }
              : rule.trigger.type === 'task_completed'
                ? { type: 'task_completed' }
                : { type: 'task_due_in_days' })

  const triggerMatched = matchesTrigger(rule, task, ev)
  const conditionsMatched = matchesConditions(rule, task)
  const matched = triggerMatched && conditionsMatched

  if (!matched) {
    return {
      matched: false,
      triggerMatched,
      conditionsMatched,
      actionsWouldRun: [],
      summary: !triggerMatched ? 'Trigger did not match' : 'Conditions did not match',
    }
  }

  const actionsWouldRun = rule.actions
  const labels = actionsWouldRun.map((a) => a.type.replace(/_/g, ' ')).join(', ')
  return {
    matched: true,
    triggerMatched,
    conditionsMatched,
    actionsWouldRun,
    summary: `Would run: ${labels || 'no actions'}`,
  }
}

/** Scan all tasks for due-in-days triggers (daily scheduler). */
export async function runDueInDaysRules(actorId: string): Promise<void> {
  const tasks = useTasksStore.getState().list()
  for (const task of tasks) {
    if (task.completed || !task.dueOn) continue
    await runRulesForTask({ type: 'task_due_in_days' }, task, actorId)
  }
}

/** Detect events from a task update and run matching rules. */
export async function runRulesAfterTaskUpdate(
  task: Task,
  prev: Task,
  actorId: string
): Promise<void> {
  if (isRuleEngineActive()) return

  if (task.completed && !prev.completed) {
    await runRulesForTask({ type: 'task_completed' }, task, actorId)
  }

  for (const projectId of task.projectIds) {
    const prevSection = prev.sectionIdByProject[projectId]
    const nextSection = task.sectionIdByProject[projectId]
    if (nextSection && nextSection !== prevSection) {
      await runRulesForTask(
        { type: 'task_moved_to_section', projectId, sectionId: nextSection },
        task,
        actorId
      )
    }
  }

  const prevCf = prev.customFieldValues
  const nextCf = task.customFieldValues
  const cfIds = new Set([...Object.keys(prevCf), ...Object.keys(nextCf)])
  for (const cfId of cfIds) {
    const before = prevCf[cfId]
    const after = nextCf[cfId]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const toValue = after?.type === 'dropdown' ? after.value : after?.value
      await runRulesForTask({ type: 'custom_field_changed', customFieldId: cfId, toValue }, task, actorId)
    }
  }

  if (task.dueOn !== prev.dueOn && task.dueOn) {
    await runRulesForTask({ type: 'task_due_in_days' }, task, actorId)
  }
}

/** Back-compat wrapper used by older call sites. */
export async function evaluateRulesForTask(
  task: Task,
  ctx: { event: 'create' | 'update'; actorId: string; prev?: Task; projectId?: string }
): Promise<void> {
  if (isRuleEngineActive()) return
  if (ctx.event === 'create' && ctx.projectId) {
    await runRulesForTask({ type: 'task_added_to_project', projectId: ctx.projectId }, task, ctx.actorId)
    return
  }
  if (ctx.event === 'update' && ctx.prev) {
    await runRulesAfterTaskUpdate(task, ctx.prev, ctx.actorId)
  }
}

/** Human-readable one-line rule summary for UI. */
export function describeRule(rule: Rule): string {
  const sectionName =
    rule.trigger.type === 'task_moved_to_section'
      ? useSectionsStore.getState().getById(rule.trigger.sectionId)?.name ?? 'section'
      : null
  const trigger =
    rule.trigger.type === 'task_completed'
      ? 'Task completed'
      : rule.trigger.type === 'task_added_to_project'
        ? 'Task added'
        : rule.trigger.type === 'task_moved_to_section'
          ? `Moved to ${sectionName}`
          : rule.trigger.type === 'task_due_in_days'
            ? `Due in ${rule.trigger.days} day(s)`
            : rule.trigger.type === 'custom_field_changed'
              ? 'Custom field changed'
            : rule.trigger.type === 'form_submitted'
              ? 'Form submitted'
              : 'Unknown trigger'

  const cond =
    rule.conditions.length > 0
      ? ` if ${rule.conditions.map((c) => `${c.field} ${c.op} ${String(c.value)}`).join(' & ')}`
      : ''

  const actions = rule.actions.map((a) => a.type.replace(/_/g, ' ')).join(', ')
  return `When ${trigger}${cond} → ${actions || 'no actions'}`
}
