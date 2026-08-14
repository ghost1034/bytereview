'use client'

/** PortfolioCard — summary tile with health rollup and progress bar. */
import Link from 'next/link'
import { useMemo } from 'react'
import { useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { projectColorSoft } from '../../lib/projectColors'
import {
  computePortfolioHealth,
  formatProjectStatus,
  getProjectStatusColor,
  STATUS_ORDER,
} from './portfolioHealth'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
}

export function PortfolioCard({ portfolio, workspaceId }: Props) {
  const owner = useUsersStore((s) => s.getById(portfolio.ownerId))
  const projects = useProjectsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const health = useMemo(
    () => computePortfolioHealth(portfolio, projects, tasks),
    [portfolio, projects, tasks]
  )
  const linked = projects.filter((p) => portfolio.projectIds.includes(p.id))
  const href = `/dashboard/project-management/w/${workspaceId}/portfolios/${portfolio.id}`
  const tileColor = projectColorSoft(portfolio.color ?? 'primary')

  return (
    <Link href={href} className="block">
      <article className="tl-card p-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
            style={{ background: tileColor }}
          >
            {portfolio.iconEmoji ?? '📊'}
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
            style={{
              background: `color-mix(in srgb, ${getProjectStatusColor(health.inferredStatus)} 14%, transparent)`,
              color: getProjectStatusColor(health.inferredStatus),
            }}
          >
            {formatProjectStatus(health.inferredStatus)}
          </span>
        </div>
        <h3 className="mt-3 font-medium">{portfolio.name}</h3>
        {portfolio.description && (
          <p className="mt-1 text-sm line-clamp-2" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {portfolio.description}
          </p>
        )}
        <p className="mt-2 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {owner?.name ?? 'Owner'} · {linked.length} project{linked.length === 1 ? '' : 's'}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'hsl(var(--surface-muted))' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${health.progressPct}%`, background: 'hsl(var(--success))' }}
            />
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {health.progressPct}%
          </span>
        </div>
        {linked.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter((s) => (health.statusCounts[s ?? 'unset'] ?? 0) > 0).map((status) => {
              const key = status ?? 'unset'
              return (
                <span
                  key={key}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium capitalize"
                  style={{
                    background: 'hsl(var(--surface-muted))',
                    color: getProjectStatusColor(status === 'unset' ? null : status),
                  }}
                >
                  {formatProjectStatus(status === 'unset' ? null : status)} · {health.statusCounts[key] ?? 0}
                </span>
              )
            })}
          </div>
        )}
      </article>
    </Link>
  )
}
