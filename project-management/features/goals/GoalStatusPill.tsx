'use client'

/** Colored pill for goal status. */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Goal } from '../../types'
import { formatGoalStatus, getGoalStatusColor } from '../../lib/goals/goalProgress'

const EDITABLE: Goal['status'][] = [
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
  'dropped',
]

type Props = {
  status: Goal['status']
  editable?: boolean
  onChange?: (status: Goal['status']) => void
}

/** Renders a goal status pill with optional dropdown edit. */
export function GoalStatusPill({ status, editable, onChange }: Props) {
  const color = getGoalStatusColor(status)
  const pill = (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
      style={{ background: `${color}22`, color }}
    >
      {formatGoalStatus(status)}
    </span>
  )
  if (!editable || !onChange) return pill
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:shadow-focus">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="tl-popover-surface" align="start">
        {EDITABLE.map((key) => (
          <DropdownMenuItem key={key} onClick={() => onChange(key)}>
            {formatGoalStatus(key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
