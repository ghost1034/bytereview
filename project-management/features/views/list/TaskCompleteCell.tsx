'use client'

/**
 * TaskCompleteCell — circle control for marking a task complete/incomplete.
 */
import { Check } from 'lucide-react'
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TasklyticTooltipContent } from '../../ui/TasklyticTooltipContent'
import type { Task } from '../../../types'
import { toggleComplete } from '../../../lib/taskActions'
import { useAuthStore } from '../../../stores/auth'

type Props = {
  task: Task
}

export function TaskCompleteCell({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
            title={task.completed ? 'Mark incomplete' : 'Mark complete'}
            className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors hover:ring-2 hover:ring-[var(--accent)]/30"
            style={{
              borderColor: 'var(--accent)',
              background: task.completed ? 'var(--accent)' : 'var(--bg-elevated)',
              boxShadow: task.completed
                ? undefined
                : '0 0 0 1px color-mix(in srgb, var(--accent) 15%, transparent)',
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (currentUserId) void toggleComplete(task.id, currentUserId)
            }}
          >
            {task.completed ? (
              <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--bg-elevated)' }} />
            ) : null}
          </button>
        </TooltipTrigger>
        <TasklyticTooltipContent side="top" className="max-w-xs">
          {task.completed
            ? 'Mark incomplete. Use Undo in the toolbar if you completed this by mistake.'
            : 'Mark complete. Use Show completed in the toolbar if the row hides.'}
        </TasklyticTooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
