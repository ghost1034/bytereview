/**
 * Task bar fill colors — mirrors Calendar "Color by" options.
 */
import type { Project, Section, Tag, Task, User } from '../../../types'
import { findFieldByName } from '../../custom-fields/useProjectFields'
import type { ColorBy } from './types'

const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  '#7c6a5d',
  '#5d7c6a',
  '#6a5d7c',
  '#7c5d6a',
  '#5d6a7c',
  '#6a7c5d',
]

function hashColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

/** Resolve bar background for a task. */
export function taskBarColor(
  task: Task,
  colorBy: ColorBy,
  project: Project,
  sections: Section[],
  users: User[],
  tags: Tag[]
): string {
  if (task.completed) return 'hsl(var(--foreground-subtle))'
  if (colorBy === 'section') {
    const sid = task.sectionIdByProject[project.id] ?? sections[0]?.id
    const idx = sections.findIndex((s) => s.id === sid)
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : 'hsl(var(--primary))'
  }
  if (colorBy === 'assignee') {
    return task.assigneeId ? hashColor(task.assigneeId) : 'hsl(var(--foreground-muted))'
  }
  if (colorBy === 'tag') {
    const tid = task.tagIds[0]
    const tag = tags.find((t) => t.id === tid)
    return tag?.color ?? hashColor(tid ?? task.id)
  }
  const field = findFieldByName(project.workspaceId, 'Priority')
  if (field) {
    const val = task.customFieldValues[field.id]
    if (val?.type === 'dropdown' && val.value) return hashColor(String(val.value))
  }
  return 'hsl(var(--primary))'
}
