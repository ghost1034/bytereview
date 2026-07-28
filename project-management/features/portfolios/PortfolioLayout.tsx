'use client'

/** PortfolioLayout — portfolio shell with topbar tab portal and tab content. */
import Link from 'next/link'
import { useMemo } from 'react'
import { TopbarTabsPortal } from '../../lib/portfolios/useTopbarTabs'
import { PORTFOLIO_TABS, type EnrichedPortfolio, type PortfolioTab } from '../../lib/portfolios/types'
import { useUsersStore } from '../../stores/entities'
import { ProjectStatusPill } from '../projects/ProjectStatusPill'
import { PortfolioProjectsTab } from './PortfolioProjectsTab'
import { PortfolioProgressTab } from './PortfolioProgressTab'
import { PortfolioDashboardTab } from './PortfolioDashboardTab'
import { PortfolioWorkloadTab } from './PortfolioWorkloadTab'
import { PortfolioTimelineTab } from './PortfolioTimelineTab'
import { PortfolioSettingsTab } from './PortfolioSettingsTab'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
  currentUserId: string
  activeTab: PortfolioTab
}

export function PortfolioLayout({ portfolio, workspaceId, currentUserId, activeTab }: Props) {
  const owner = useUsersStore((s) => s.getById(portfolio.ownerId))
  const base = `/dashboard/tasklytic/w/${workspaceId}/portfolios/${portfolio.id}`

  const content = useMemo(() => {
    switch (activeTab) {
      case 'projects':
        return <PortfolioProjectsTab portfolio={portfolio} workspaceId={workspaceId} />
      case 'progress':
        return <PortfolioProgressTab portfolio={portfolio} workspaceId={workspaceId} currentUserId={currentUserId} />
      case 'dashboard':
        return <PortfolioDashboardTab portfolio={portfolio} />
      case 'workload':
        return <PortfolioWorkloadTab portfolio={portfolio} workspaceId={workspaceId} />
      case 'timeline':
        return <PortfolioTimelineTab portfolio={portfolio} workspaceId={workspaceId} />
      case 'settings':
        return <PortfolioSettingsTab portfolio={portfolio} workspaceId={workspaceId} />
      default:
        return null
    }
  }, [activeTab, currentUserId, portfolio, workspaceId])

  return (
    <div className="space-y-4">
      <TopbarTabsPortal>
        <nav className="flex gap-4">
          {PORTFOLIO_TABS.map((tab) => {
            const href = tab.id === 'projects' ? base : `${base}/${tab.id}`
            const active = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={href}
                className="relative pb-1 text-sm font-medium transition-colors"
                style={{ color: active ? 'var(--primary)' : 'var(--ink-secondary)' }}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />
                )}
              </Link>
            )
          })}
        </nav>
      </TopbarTabsPortal>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-xl"
            style={{ background: 'var(--primary-soft)' }}
          >
            {portfolio.iconEmoji ?? '📊'}
          </div>
          <div>
            <h1 className="font-serif text-2xl">{portfolio.name}</h1>
            {portfolio.description && (
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>{portfolio.description}</p>
            )}
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
              {owner?.name ?? 'Owner'} · {portfolio.projectIds.length} project{portfolio.projectIds.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <ProjectStatusPill status={portfolio.status} />
      </header>

      {content}
    </div>
  )
}
