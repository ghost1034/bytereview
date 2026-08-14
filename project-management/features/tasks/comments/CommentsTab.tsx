'use client'

/**
 * CommentsTab — composer plus threaded comment list for a task.
 */
import { useMemo } from 'react'
import { useCommentsStore, useUsersStore, useWorkspacesStore } from '../../../stores/entities'
import type { Task, User } from '../../../types'
import { CommentComposer } from './CommentComposer'
import { CommentThread } from './CommentThread'

type Props = { task: Task }

/** Comments tab content inside task detail. */
export function CommentsTab({ task }: Props) {
  const count = useCommentsStore((s) => s.list().filter((c) => c.taskId === task.id).length)
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(task.workspaceId))

  const workspaceUsers = useMemo(() => {
    const memberIds = new Set(workspace?.memberIds ?? users.map((u) => u.id))
    return users.filter((u) => memberIds.has(u.id))
  }, [users, workspace?.memberIds])

  const userById = useMemo(() => {
    const map = new Map<string, User>()
    users.forEach((u) => map.set(u.id, u))
    return map
  }, [users])

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {count} comment{count === 1 ? '' : 's'}
      </p>
      <CommentComposer task={task} workspaceUsers={workspaceUsers} />
      <CommentThread task={task} userById={userById} workspaceUsers={workspaceUsers} />
    </div>
  )
}
