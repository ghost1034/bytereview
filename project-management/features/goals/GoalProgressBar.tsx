'use client'

/** Inline progress bar for goals. */
import { Progress } from '@/components/ui/progress'
import type { Goal } from '../../types'
import { getGoalStatusColor } from '../../lib/goals/goalProgress'

type Props = {
  percent: number
  status?: Goal['status']
  showLabel?: boolean
  className?: string
}

/** Horizontal progress bar with optional percent label. */
export function GoalProgressBar({ percent, status = 'on_track', showLabel = true, className }: Props) {
  const color = getGoalStatusColor(status)
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Progress
        value={percent}
        className="h-2 flex-1"
        style={{ ['--progress-color' as string]: color }}
      />
      {showLabel ? (
        <span className="text-xs tabular-nums font-medium min-w-[2.5rem] text-right" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {percent}%
        </span>
      ) : null}
    </div>
  )
}
