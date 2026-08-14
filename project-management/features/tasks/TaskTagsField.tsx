'use client'

/**
 * TaskTagsField — tag row wired to TagPicker and taskActions.
 */
import { addTagToTask, removeTagFromTask } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'
import { TagPicker } from './TagPicker'

type Props = { task: Task }

export function TaskTagsField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)

  return (
    <div className="text-sm">
      <p className="mb-1.5" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Tags
      </p>
      <TagPicker
        workspaceId={task.workspaceId}
        selectedIds={task.tagIds}
        onAdd={(tagId) => currentUserId && void addTagToTask(task.id, tagId, currentUserId)}
        onRemove={(tagId) => currentUserId && void removeTagFromTask(task.id, tagId, currentUserId)}
      />
    </div>
  )
}
