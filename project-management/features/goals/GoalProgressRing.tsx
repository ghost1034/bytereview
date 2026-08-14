'use client'

/** Circular progress ring for goal detail header. */
import type { Goal } from '../../types'
import { getGoalStatusColor } from '../../lib/goals/goalProgress'

type Props = {
  percent: number
  status?: Goal['status']
  size?: number
}

/** SVG ring showing goal completion percent. */
export function GoalProgressRing({ percent, status = 'on_track', size = 120 }: Props) {
  const stroke = getGoalStatusColor(status)
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--surface-muted))" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span
        className="absolute font-sans text-2xl font-semibold tabular-nums"
        style={{ color: 'hsl(var(--foreground))' }}
      >
        {percent}%
      </span>
    </div>
  )
}
