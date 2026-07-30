/**
 * Helpers to author curated templates with relative dates, roles, and subtasks.
 */
import { newId } from '../ids'
import type { CuratedProjectTemplate, TemplateFieldSpec, TemplateTaskSpec } from './types'
import type { ProjectView, Project, TaskTemplate } from '../../types'

/** Build enum options with stable ids for template field specs. */
export function enumOptions(labels: Array<{ label: string; color: string }>) {
  return labels.map((o) => ({ id: newId(), label: o.label, color: o.color }))
}

/** Map flat task specs to nested TaskTemplate objects. */
export function specsToTaskTemplates(specs: TemplateTaskSpec[]): TaskTemplate[] {
  return specs.map((spec) => ({
    id: newId(),
    name: spec.name,
    defaults: {
      resourceSubtype: spec.milestone ? 'milestone' : 'default_task',
      notes: spec.notes,
      ...(spec.relativeDueDays != null ? { dueOn: `+${spec.relativeDueDays}` } : {}),
      ...(spec.relativeStartDays != null ? { startOn: `+${spec.relativeStartDays}` } : {}),
      ...(spec.assigneeRole ? { notes: [spec.notes, `Role: ${spec.assigneeRole}`].filter(Boolean).join('\n') } : {}),
    },
    subtaskTemplates: (spec.subtasks ?? []).map((sub) => ({
      id: newId(),
      name: sub.name,
      defaults: {
        resourceSubtype: sub.milestone ? 'milestone' : 'default_task',
        notes: sub.notes,
        ...(sub.relativeDueDays != null ? { dueOn: `+${sub.relativeDueDays}` } : {}),
        ...(sub.assigneeRole ? { notes: [sub.notes, `Role: ${sub.assigneeRole}`].filter(Boolean).join('\n') } : {}),
      },
      subtaskTemplates: [],
    })),
  }))
}

/** Generate tasks across a section with optional day stepping and role. */
export function tasksInSection(
  sectionIndex: number,
  names: string[],
  opts?: { startDay?: number; dayStep?: number; role?: string; milestoneAt?: number[] }
): TemplateTaskSpec[] {
  const start = opts?.startDay ?? 0
  const step = opts?.dayStep ?? 1
  const milestones = new Set(opts?.milestoneAt ?? [])
  return names.map((name, i) => ({
    name,
    sectionIndex,
    relativeDueDays: start + i * step,
    assigneeRole: opts?.role,
    milestone: milestones.has(i),
  }))
}

/** Count all tasks including subtasks in specs. */
export function countTaskSpecs(specs: TemplateTaskSpec[]): number {
  return specs.reduce((n, s) => n + 1 + (s.subtasks?.length ?? 0), 0)
}

/** Base curated template factory. */
export function defineTemplate(
  partial: Omit<CuratedProjectTemplate, 'taskTemplates' | 'defaults'> & {
    taskSpecs: TemplateTaskSpec[]
    defaults?: Partial<Project>
  }
): CuratedProjectTemplate {
  const { taskSpecs, defaults = {}, ...rest } = partial
  return {
    ...rest,
    defaults,
    taskTemplates: specsToTaskTemplates(taskSpecs),
    taskSpecs,
  }
}

/** Standard global field references by name. */
export const GLOBAL_FIELD_NAMES = {
  priority: 'Priority',
  status: 'Status',
} as const

/** Reuse global Priority / Status fields on a template. */
export function withGlobalStatusPriority(): TemplateFieldSpec[] {
  return [
    { name: GLOBAL_FIELD_NAMES.priority, type: 'dropdown', reuseGlobalName: GLOBAL_FIELD_NAMES.priority },
    { name: GLOBAL_FIELD_NAMES.status, type: 'dropdown', reuseGlobalName: GLOBAL_FIELD_NAMES.status },
  ]
}

/** Default enabled views for heavy transaction templates. */
export const ALL_VIEWS: ProjectView[] = ['list', 'board', 'calendar', 'timeline', 'gantt']
