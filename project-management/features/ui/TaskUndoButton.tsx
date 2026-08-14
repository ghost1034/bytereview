'use client'

import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  TooltipContent,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TASK_UNDO_MAX, useTaskUndoStore } from '../../stores/taskUndo'

/** Toolbar control to reverse the last task action (max 10). */
export function TaskUndoButton() {
  const count = useTaskUndoStore((s) => s.stack.length)
  const undoLast = useTaskUndoStore((s) => s.undoLast)

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={count === 0}
            onClick={() => void undoLast()}
          >
            <Undo2 className="h-4 w-4" />
            Undo
            {count > 0 ? (
              <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
                ({count})
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {count > 0
            ? `Undo the last action (${count} of ${TASK_UNDO_MAX} saved).`
            : `No actions to undo. Complete, delete, and bulk edits in List or Board are tracked (up to ${TASK_UNDO_MAX}).`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
