/**
 * Pure helpers for List view row building and task ordering.
 */
import { format, isToday, startOfToday } from 'date-fns'
import type { Project, Section, Task } from '../../../types'
import type { TaskGroup } from '../../../lib/query/applyQuery'
import type { ListRow } from './listTypes'

/** Sort tasks within a section using persisted project order. */
export function orderTasksInSection(tasks: Task[], orderIds: string[] | undefined): Task[] {
  if (!orderIds?.length) return [...tasks]
  const index = new Map(orderIds.map((id, i) => [id, i]))
  return [...tasks].sort((a, b) => {
    const ai = index.get(a.id)
    const bi = index.get(b.id)
    if (ai === undefined && bi === undefined) return a.name.localeCompare(b.name)
    if (ai === undefined) return 1
    if (bi === undefined) return -1
    return ai - bi
  })
}

/** Short due label (MMM d) with semantic color token. */
export function dueDisplay(task: Task): { label: string; color: string } {
  if (!task.dueOn) return { label: '—', color: 'hsl(var(--foreground-muted))' }
  const label = format(new Date(task.dueOn), 'MMM d')
  if (task.completed) return { label, color: 'hsl(var(--foreground-muted))' }
  const due = new Date(task.dueOn)
  const today = startOfToday()
  if (due < today) return { label, color: 'hsl(var(--destructive))' }
  if (isToday(due)) return { label, color: 'hsl(var(--warning))' }
  return { label, color: 'hsl(var(--foreground-muted))' }
}

type BuildRowsInput = {
  groups: TaskGroup[]
  sections: Section[]
  groupBySection: boolean
  collapsedIds: Set<string>
  expandedTaskIds: Set<string>
  project: Project
  allTasks: Task[]
  getChildren: (parentId: string) => Task[]
}

function appendTaskRows(
  rows: ListRow[],
  task: Task,
  depth: number,
  groupKey: string,
  sectionId: string | undefined,
  expandedTaskIds: Set<string>,
  getChildren: (parentId: string) => Task[]
): void {
  rows.push({ kind: 'task', task, depth, groupKey, sectionId })
  if (!expandedTaskIds.has(task.id)) return
  getChildren(task.id).forEach((child) => {
    appendTaskRows(rows, child, depth + 1, groupKey, sectionId, expandedTaskIds, getChildren)
    rows.push({ kind: 'add-subtask', parentId: task.id, groupKey, sectionId })
  })
}

/** Flatten grouped tasks into render rows for the list body. */
export function buildListRows(input: BuildRowsInput): ListRow[] {
  const {
    groups,
    sections,
    groupBySection,
    collapsedIds,
    expandedTaskIds,
    project,
    allTasks,
    getChildren,
  } = input

  if (!sections.length && !allTasks.filter((t) => t.projectIds.includes(project.id)).length) {
    return [{ kind: 'empty' }]
  }

  const rows: ListRow[] = []

  groups.forEach((group) => {
    const section = groupBySection ? sections.find((s) => s.id === group.key) : undefined
    const sectionId = groupBySection
      ? section?.id
      : group.tasks[0]?.sectionIdByProject[project.id] ?? sections[0]?.id
    const order = groupBySection && section ? project.taskOrderBySection?.[section.id] : undefined
    const ordered = orderTasksInSection(group.tasks, order)
    const taskIds = ordered.map((t) => t.id)
    const collapsed = collapsedIds.has(group.key)

    rows.push({
      kind: 'group-header',
      groupKey: group.key,
      label: group.label,
      section,
      taskIds,
      collapsed,
      isSectionGroup: groupBySection,
    })

    if (collapsed) return

    rows.push({ kind: 'add-task', groupKey: group.key, sectionId })
    ordered.forEach((task) => {
      appendTaskRows(rows, task, 0, group.key, sectionId, expandedTaskIds, getChildren)
    })
  })

  if (groupBySection) rows.push({ kind: 'add-section' })
  return rows
}

/** Reorder an id array by moving activeId before overId (or append if overId missing). */
export function reorderIds(ids: string[], activeId: string, overId: string | null): string[] {
  const next = ids.filter((id) => id !== activeId)
  if (!overId) {
    next.push(activeId)
    return next
  }
  const idx = next.indexOf(overId)
  if (idx === -1) next.push(activeId)
  else next.splice(idx, 0, activeId)
  return next
}
