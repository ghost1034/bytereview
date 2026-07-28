'use client'

/** Nested table list view for goals. */
import Link from 'next/link'
import { formatRelative } from '../../lib/time'
import type { Goal } from '../../types'
import { buildGoalTree, flattenGoalTree } from '../../lib/goals/goalTree'
import { useGoalProgress } from '../../lib/goals/goalProgress'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { GoalProgressBar } from './GoalProgressBar'
import { GoalStatusPill } from './GoalStatusPill'

type Props = {
  goals: Goal[]
  workspaceId: string
}

function ListRow({ goal, depth, workspaceId }: { goal: Goal; depth: number; workspaceId: string }) {
  const owner = useUsersStore((s) => s.getById(goal.ownerId))
  const { percent } = useGoalProgress(goal.id)
  const lastUpdate = useStatusUpdatesStore((s) =>
    s
      .list()
      .filter((u) => u.scope.type === 'goal' && u.scope.id === goal.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  )

  return (
    <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <td className="py-3 pr-4">
        <Link
          href={`/dashboard/project-management/w/${workspaceId}/goals/${goal.id}`}
          className="font-medium hover:underline"
          style={{ paddingLeft: depth * 20 }}
        >
          {goal.name}
        </Link>
      </td>
      <td className="py-3 pr-4 text-sm" style={{ color: 'var(--ink-secondary)' }}>{owner?.name ?? '—'}</td>
      <td className="py-3 pr-4 min-w-[140px]">
        <GoalProgressBar percent={percent} status={goal.status} />
      </td>
      <td className="py-3 pr-4"><GoalStatusPill status={goal.status} /></td>
      <td className="py-3 pr-4 text-sm whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
        {goal.timeFrame.start} – {goal.timeFrame.end}
      </td>
      <td className="py-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
        {lastUpdate ? formatRelative(lastUpdate.createdAt) : '—'}
      </td>
    </tr>
  )
}

/** Indented table of goals with progress columns. */
export function GoalsListView({ goals, workspaceId }: Props) {
  const tree = buildGoalTree(goals)
  const rows = flattenGoalTree(tree)

  return (
    <div className="tl-card overflow-x-auto shadow-paper-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="py-2 pr-4 font-medium">Goal</th>
            <th className="py-2 pr-4 font-medium">Owner</th>
            <th className="py-2 pr-4 font-medium">Progress</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Time period</th>
            <th className="py-2 font-medium">Last update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ goal, depth }) => (
            <ListRow key={goal.id} goal={goal} depth={depth} workspaceId={workspaceId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
