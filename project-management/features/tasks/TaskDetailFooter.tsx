'use client'

/**
 * TaskDetailFooter — created-by caption and overflow actions menu.
 */
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteTask,
  duplicateTask,
  setApprovalStatus,
  setSubtype,
  toggleComplete,
} from '../../lib/taskActions'
import { formatDate } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useActivityStore, useUsersStore } from '../../stores/entities'
import type { Task } from '../../types'

type Props = {
  task: Task
  onClose: () => void
  onOpenTask?: (taskId: string) => void
}

export function TaskDetailFooter({ task, onClose, onOpenTask }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const createdEvent = useActivityStore((s) =>
    s.list().find((e) => e.taskId === task.id && e.type === 'task_created')
  )
  const creator = users.find((u) => u.id === createdEvent?.actorId)

  const onDelete = async () => {
    if (!window.confirm('Delete this task permanently?')) return
    await deleteTask(task.id, currentUserId ?? undefined)
    onClose()
  }

  const onDuplicate = async () => {
    if (!currentUserId) return
    const copy = await duplicateTask(task.id, currentUserId)
    if (copy) onOpenTask?.(copy.id)
  }

  return (
    <footer className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
        {creator ? `Created by ${creator.name} on ${formatDate(task.createdAt)}` : `Created ${formatDate(task.createdAt)}`}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="tl-popover-surface" align="end">
          {task.completed ? (
            <DropdownMenuItem
              onClick={() => {
                if (!currentUserId) return
                if (task.resourceSubtype === 'approval') {
                  void setApprovalStatus(task.id, 'pending', currentUserId)
                } else {
                  void toggleComplete(task.id, currentUserId)
                }
              }}
            >
              Mark incomplete
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => void onDuplicate()}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => currentUserId && void setSubtype(task.id, 'milestone', currentUserId)}>
            Convert to milestone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => currentUserId && void setSubtype(task.id, 'approval', currentUserId)}>
            Convert to approval
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => void onDelete()}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </footer>
  )
}
