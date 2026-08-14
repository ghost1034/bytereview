'use client'

/** Recent goals overview card for workspace home. */
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useGoalsStore } from '../../stores/entities'
import { GoalProgressBar } from '../goals/GoalProgressBar'
import { GoalStatusPill } from '../goals/GoalStatusPill'
import { useGoalProgress } from '../../lib/goals/goalProgress'

type Props = { workspaceId: string }

function GoalRow({ goalId, workspaceId }: { goalId: string; workspaceId: string }) {
  const goal = useGoalsStore((s) => s.getById(goalId))
  const { percent } = useGoalProgress(goalId)
  if (!goal) return null
  return (
    <Link
      href={`/dashboard/project-management/w/${workspaceId}/goals/${goal.id}`}
      className="rounded-lg border border-border bg-card text-card-foreground-hover block rounded-lg border px-3 py-2 shadow-sm"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{goal.name}</span>
        <GoalStatusPill status={goal.status} />
      </div>
      <GoalProgressBar percent={percent} className="mt-2" />
    </Link>
  )
}

/** Compact goals preview (up to 3) for the home page. */
export function HomeGoalsOverview({ workspaceId }: Props) {
  const goals = useGoalsStore((s) =>
    s
      .list()
      .filter((g) => g.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3)
  )
  const base = `/dashboard/project-management/w/${workspaceId}/goals`

  if (!goals.length) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-sans text-lg">Goals</h2>
        <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
          <Link href={base}>View all</Link>
        </Button>
      </div>
      <div className="space-y-2">
        {goals.map((g) => (
          <GoalRow key={g.id} goalId={g.id} workspaceId={workspaceId} />
        ))}
      </div>
    </section>
  )
}
