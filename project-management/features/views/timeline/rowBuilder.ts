/**
 * Row builder for timeline left rail and chart rows.
 */
import type { Section, Task, User, Tag } from '../../../types'
import type { RowsBy, TimelineRow } from './types'

/** Build flat or grouped rows for the left rail + chart. */
export function buildRows(
  tasks: Task[],
  variant: 'timeline' | 'gantt',
  rowsBy: RowsBy,
  sections: Section[],
  projectId: string,
  collapsedSectionIds: Set<string>,
  users: User[],
  tags: Tag[]
): TimelineRow[] {
  const rows: TimelineRow[] = []
  const pushTask = (task: Task) => {
    rows.push({ kind: 'task', task, rowIndex: rows.length })
  }

  if (variant === 'gantt') {
    const bySection = new Map<string, Task[]>()
    sections.forEach((s) => bySection.set(s.id, []))
    tasks.forEach((t) => {
      const sid = t.sectionIdByProject[projectId] ?? sections[0]?.id
      if (sid && bySection.has(sid)) bySection.get(sid)!.push(t)
      else if (sections[0]) bySection.get(sections[0].id)!.push(t)
    })
    sections.forEach((section) => {
      const list = bySection.get(section.id) ?? []
      if (!list.length) return
      rows.push({ kind: 'section', sectionId: section.id, label: section.name })
      if (collapsedSectionIds.has(section.id)) return
      list.forEach(pushTask)
    })
    return rows
  }

  if (rowsBy === 'none') {
    tasks.forEach(pushTask)
    return rows
  }

  const groups = new Map<string, { label: string; tasks: Task[] }>()
  tasks.forEach((task) => {
    let key = 'ungrouped'
    let label = 'Ungrouped'
    if (rowsBy === 'section') {
      const sid = task.sectionIdByProject[projectId] ?? sections[0]?.id ?? 'none'
      key = sid
      label = sections.find((s) => s.id === sid)?.name ?? 'No section'
    } else if (rowsBy === 'assignee') {
      key = task.assigneeId ?? 'unassigned'
      label = users.find((u) => u.id === task.assigneeId)?.name ?? 'Unassigned'
    } else {
      const tid = task.tagIds[0] ?? 'untagged'
      key = tid
      label = tags.find((tg) => tg.id === tid)?.name ?? 'Untagged'
    }
    const g = groups.get(key) ?? { label, tasks: [] }
    g.tasks.push(task)
    groups.set(key, g)
  })

  groups.forEach((g, key) => {
    rows.push({ kind: 'swimlane', key, label: g.label })
    g.tasks.forEach(pushTask)
  })
  return rows
}
