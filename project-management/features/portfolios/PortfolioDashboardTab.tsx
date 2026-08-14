'use client'

/** PortfolioDashboardTab — default 3-chart dashboard until step 26 builder. */
import { useMemo } from 'react'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { averageProjectProgress, projectsByOwner } from '../../lib/portfolios/portfolioStats'
import { useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import {
  PortfolioBarChart,
  PortfolioDonutChart,
  PortfolioNumberCard,
  statusCountsToDonut,
} from './PortfolioChartWidgets'
import { computePortfolioHealth } from './portfolioHealth'

type Props = { portfolio: EnrichedPortfolio }

export function PortfolioDashboardTab({ portfolio }: Props) {
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())

  const health = useMemo(() => computePortfolioHealth(portfolio, projects, tasks), [portfolio, projects, tasks])
  const avgPct = useMemo(() => averageProjectProgress(projects, tasks, portfolio), [portfolio, projects, tasks])
  const ownerBars = useMemo(() => {
    return projectsByOwner(projects, portfolio).map((row) => ({
      label: users.find((u) => u.id === row.ownerId)?.name ?? 'Unknown',
      value: row.count,
    }))
  }, [portfolio, projects, users])
  const donutData = useMemo(() => statusCountsToDonut(health.statusCounts), [health.statusCounts])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm md:col-span-1">
          <h3 className="mb-2 font-medium">Projects by status</h3>
          {donutData.length ? <PortfolioDonutChart data={donutData} /> : (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No projects yet.</p>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm md:col-span-1">
          <h3 className="mb-2 font-medium">Projects by owner</h3>
          {ownerBars.length ? <PortfolioBarChart data={ownerBars} /> : (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No projects yet.</p>
          )}
        </section>
        <PortfolioNumberCard label="Average % complete" value={avgPct} suffix="%" />
      </div>
    </div>
  )
}
