'use client'

/** Sticky mobile action bar for task detail — Complete, Comment, More. */
import { Check, MessageSquare, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toggleComplete } from '../../lib/taskActions'
import type { Task } from '../../types'

type Props = {
  task: Task
  currentUserId: string | null
  onClose: () => void
  onFocusComments?: () => void
}

/** Bottom action bar visible on mobile task detail only. */
export function MobileTaskDetailBar({ task, currentUserId, onClose, onFocusComments }: Props) {
  return (
    <div
      className="sticky bottom-0 flex items-center gap-2 border-t px-3 py-2 lg:hidden"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
      role="toolbar"
      aria-label="Task actions"
    >
      <Button
        size="sm"
        className="tl-btn-primary flex-1 border-0"
        disabled={!currentUserId}
        onClick={() => currentUserId && void toggleComplete(task.id, currentUserId)}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        <Check className="mr-1 h-4 w-4" />
        {task.completed ? 'Reopen' : 'Complete'}
      </Button>
      <Button size="sm" variant="outline" className="flex-1" onClick={onFocusComments} aria-label="Add comment">
        <MessageSquare className="mr-1 h-4 w-4" /> Comment
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="tl-popover-surface" align="end">
          <DropdownMenuItem onClick={onClose}>Close</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
