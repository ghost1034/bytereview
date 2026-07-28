import type { Tag, Task } from '../../../types'

export const BOARD_VIEWPORT_HEIGHT = 'calc(100vh - 18rem)'

export const BOARD_VIEWPORT_MIN_HEIGHT = 280

const UNASSIGNED = '__unassigned__'

export function assigneeKey(task: Task): string {
  return task.assigneeId ?? UNASSIGNED
}

export function assigneeLabel(task: Task, users: { id: string; name: string }[]): string {
  if (!task.assigneeId) return 'Unassigned'
  return users.find((u) => u.id === task.assigneeId)?.name ?? 'Unknown'
}

/** Group tasks by assignee for swimlane rows. */
export function groupByAssignee(
  tasks: Task[],
  users: { id: string; name: string }[]
): { key: string; label: string; tasks: Task[] }[] {
  const map = new Map<string, Task[]>()
  tasks.forEach((t) => {
    const key = assigneeKey(t)
    const list = map.get(key) ?? []
    list.push(t)
    map.set(key, list)
  })
  return [...map.entries()]
    .map(([key, laneTasks]) => ({
      key,
      label:
        key === UNASSIGNED ? 'Unassigned' : users.find((u) => u.id === key)?.name ?? 'Unknown',
      tasks: laneTasks,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function isOverWip(count: number, limit?: number): boolean {
  return limit != null && limit > 0 && count > limit
}

/** True when a cross-column drop would exceed the WIP limit. */
export function wouldBlockWipDrop(count: number, limit?: number): boolean {
  return limit != null && limit > 0 && count >= limit
}

export function toggleCollapsed(ids: string[] | undefined, sectionId: string): string[] {
  const set = new Set(ids ?? [])
  if (set.has(sectionId)) set.delete(sectionId)
  else set.add(sectionId)
  return [...set]
}

/** Strip HTML for plain-text card previews. */
export function stripHtml(html: string | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, '').trim()
}

/** Highest-priority tag color for card cover strip. */
export function coverColorFromTags(task: Task, tags: Tag[]): string | undefined {
  const taskTags = task.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t))
  if (!taskTags.length) return undefined
  return taskTags[0]?.color
}

/** Due-date pill colors based on proximity. */
export function dueChipStyle(dueOn?: string): { background: string; color: string } {
  if (!dueOn) {
    return { background: 'var(--bg-muted)', color: 'var(--ink-muted)' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueOn.slice(0, 10))
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0) {
    return {
      background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
      color: 'var(--danger)',
    }
  }
  if (diff <= 2) {
    return {
      background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
      color: 'var(--warning)',
    }
  }
  return { background: 'var(--bg-muted)', color: 'var(--ink-secondary)' }
}

/** Order tasks by persisted section order with fallback to query sort order. */
export function orderTasksInSection(
  tasks: Task[],
  sectionId: string,
  taskOrderBySection?: Record<string, string[]>
): Task[] {
  const order = taskOrderBySection?.[sectionId]
  if (!order?.length) return tasks
  const index = new Map(order.map((id, i) => [id, i]))
  return [...tasks].sort((a, b) => (index.get(a.id) ?? 9999) - (index.get(b.id) ?? 9999))
}

/** Build section → tasks map for a project. */
export function buildTasksBySection(
  tasks: Task[],
  sections: { id: string }[],
  projectId: string,
  taskOrderBySection?: Record<string, string[]>
): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  sections.forEach((s) => map.set(s.id, []))
  tasks.forEach((t) => {
    const sid = t.sectionIdByProject[projectId] ?? sections[0]?.id
    if (sid && map.has(sid)) map.get(sid)!.push(t)
  })
  sections.forEach((s) => {
    map.set(s.id, orderTasksInSection(map.get(s.id) ?? [], s.id, taskOrderBySection))
  })
  return map
}
