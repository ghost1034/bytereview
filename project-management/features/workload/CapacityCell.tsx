'use client'

/** Heatmap cell showing effort vs capacity for one bucket. */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cellBackground, formatHours } from '../../lib/workload'
import type { WorkloadCell } from '../../lib/workload'

type Props = {
  cell: WorkloadCell
  onClick: () => void
  onDropTask?: (taskId: string) => void
  isTimeOff?: boolean
}

/** Colored capacity cell with overload stripe. */
export function CapacityCell({ cell, onClick, onDropTask, isTimeOff }: Props) {
  const bg = isTimeOff
    ? 'repeating-linear-gradient(135deg, hsl(var(--surface-muted)) 0 6px, hsl(var(--border)) 6px 12px)'
    : cellBackground(cell.level, cell.ratio)

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            onDragOver={(e) => {
              if (onDropTask) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const taskId = e.dataTransfer.getData('text/task-id')
              if (taskId && onDropTask) onDropTask(taskId)
            }}
            className="relative h-12 min-w-[72px] rounded-md border text-xs tabular-nums transition-opacity hover:opacity-90"
            style={{
              borderColor: 'hsl(var(--border))',
              background: bg,
              color: cell.level === 'over' ? 'hsl(var(--destructive))' : 'hsl(var(--foreground-muted))',
            }}
          >
            <span className="block px-1 py-2">
              {formatHours(cell.effortHours)} / {formatHours(cell.capacityHours)}
            </span>
            {cell.level === 'over' ? (
              <span
                className="pointer-events-none absolute inset-y-1 right-0 w-1 rounded-full"
                style={{ background: 'hsl(var(--destructive))' }}
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{Math.round(cell.ratio * 100)}% utilized · {cell.taskIds.length} task(s)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
