'use client'

/** Compact goal card for tree nodes and lists. */
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Goal } from '../../types'
import { getGoalStatusColor, useGoalProgress } from '../../lib/goals/goalProgress'
import { GoalProgressBar } from './GoalProgressBar'
import { GoalStatusPill } from './GoalStatusPill'

type Props = {
  goal: Goal
  workspaceId: string
  depth?: number
  expanded?: boolean
  hasChildren?: boolean
  onToggle?: () => void
  onSelect?: () => void
  selected?: boolean
  draggable?: boolean
  onDragStart?: () => void
}

/** Single goal row/card with progress and status. */
export function GoalCard({
  goal,
  workspaceId,
  depth = 0,
  expanded,
  hasChildren,
  onToggle,
  onSelect,
  selected,
  draggable,
  onDragStart,
}: Props) {
  const { percent, isProjectDriven } = useGoalProgress(goal.id)
  const accent = getGoalStatusColor(goal.status)

  return (
    <div
      className="tl-card rounded-lg p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{
        marginLeft: depth * 16,
        outline: selected ? '2px solid hsl(var(--primary))' : undefined,
        borderLeft: `3px solid ${accent}`,
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
    >
      <div className="flex items-start gap-2">
        {hasChildren ? (
          <button
            type="button"
            className="mt-0.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/project-management/w/${workspaceId}/goals/${goal.id}`}
              className="font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {goal.name}
            </Link>
            <GoalStatusPill status={goal.status} />
            {isProjectDriven ? (
              <Badge variant="outline" className="text-[10px]">Project-driven</Badge>
            ) : null}
          </div>
          <GoalProgressBar percent={percent} status={goal.status} className="mt-2" />
        </div>
      </div>
    </div>
  )
}
