'use client'

/** PortfolioProgressTab — status snapshot, goals, composer, and completion charts. */
import { useMemo } from 'react'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import {
  computePortfolioQuickStats,
  linkedGoalProgress,
  tasksCompletedOverTime,
} from '../../lib/portfolios/portfolioStats'
import {
  useGoalsStore,
  useProjectsStore,
  useStatusUpdatesStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import { formatProjectStatus, getProjectStatusColor } from './portfolioHealth'
import { PortfolioStatusComposer } from './PortfolioStatusComposer'
import { PortfolioDonutChart, PortfolioLineChart, statusCountsToDonut } from './PortfolioChartWidgets'
import { formatGoalStatus, getGoalStatusColor } from '../goals/goalProgress'
import { StatusUpdateCard } from '../status/StatusUpdateCard'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
  currentUserId: string
}

export function PortfolioProgressTab({ portfolio, currentUserId }: Props) {
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const goals = useGoalsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const updates = useStatusUpdatesStore((s) =>
    s.list()
      .filter((u) => u.scope.type === 'portfolio' && u.scope.id === portfolio.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )

  const stats = useMemo(
    () => computePortfolioQuickStats(portfolio, projects, tasks),
    [portfolio, projects, tasks]
  )
  const goalRows = useMemo(() => linkedGoalProgress(goals, portfolio), [goals, portfolio])
  const lineData = useMemo(() => tasksCompletedOverTime(tasks, portfolio), [tasks, portfolio])
  const donutData = useMemo(() => statusCountsToDonut(stats.statusCounts), [stats.statusCounts])

  return (
    <div className="space-y-6">
      <section className="tl-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-sans text-lg">Portfolio health</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(stats.statusCounts).filter(([, c]) => c > 0).map(([key, count]) => (
                <span
                  key={key}
                  className="rounded-full px-2.5 py-0.5 text-xs capitalize"
                  style={{
                    background: `color-mix(in srgb, ${getProjectStatusColor(key === 'unset' ? null : key as never)} 14%, transparent)`,
                    color: getProjectStatusColor(key === 'unset' ? null : key as never),
                  }}
                >
                  {formatProjectStatus(key === 'unset' ? null : key as never)} · {count}
                </span>
              ))}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt style={{ color: 'hsl(var(--foreground-muted))' }}>Projects</dt><dd className="font-medium">{stats.totalProjects}</dd></div>
            <div><dt style={{ color: 'hsl(var(--foreground-muted))' }}>% complete</dt><dd className="font-medium">{stats.progressPct}%</dd></div>
            <div><dt style={{ color: 'hsl(var(--foreground-muted))' }}>On-time</dt><dd className="font-medium">{stats.onTimePct}%</dd></div>
            <div><dt style={{ color: 'hsl(var(--foreground-muted))' }}>Members</dt><dd className="font-medium">{stats.memberCount}</dd></div>
          </dl>
        </div>
        {goalRows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {goalRows.map(({ goal, pct }) => (
              <span
                key={goal.id}
                className="rounded-full px-2.5 py-1 text-xs"
                style={{ background: `color-mix(in srgb, ${getGoalStatusColor(goal.status)} 14%, transparent)`, color: getGoalStatusColor(goal.status) }}
              >
                {goal.name} · {pct}% · {formatGoalStatus(goal.status)}
              </span>
            ))}
          </div>
        )}
      </section>

      {goalRows.length > 0 && (
        <section className="tl-card p-5 shadow-sm">
          <h3 className="font-sans text-lg">Linked goals</h3>
          <ul className="mt-4 space-y-3">
            {goalRows.map(({ goal, pct }) => (
              <li key={goal.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{goal.name}</span>
                  <span className="text-xs capitalize" style={{ color: getGoalStatusColor(goal.status) }}>
                    {formatGoalStatus(goal.status)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full" style={{ background: 'hsl(var(--surface-muted))' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: getGoalStatusColor(goal.status) }} />
                  </div>
                  <span className="text-xs tabular-nums">{pct}%</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tl-card p-5 shadow-sm">
        <h2 className="font-sans text-lg">Status updates</h2>
        <div className="mt-4"><PortfolioStatusComposer portfolio={portfolio} currentUserId={currentUserId} /></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tl-card p-5 shadow-sm">
          <h3 className="font-medium">Projects by status</h3>
          {donutData.length ? <PortfolioDonutChart data={donutData} /> : (
            <p className="mt-4 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Add projects to see distribution.</p>
          )}
        </section>
        <section className="tl-card p-5 shadow-sm">
          <h3 className="font-medium">Tasks completed over time</h3>
          <PortfolioLineChart data={lineData} />
        </section>
      </div>

      {updates.length > 1 && (
        <section className="space-y-3">
          <h3 className="font-sans text-lg">Past updates</h3>
          {updates.slice(1, 6).map((u) => (
            <div key={u.id} id={`status-update-${u.id}`}>
              <StatusUpdateCard update={u} author={users.find((x) => x.id === u.authorId)} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
