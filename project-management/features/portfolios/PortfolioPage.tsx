'use client'

/** PortfolioPage — portfolio detail route entry. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { asEnriched, type PortfolioTab } from '../../lib/portfolios/types'
import { useAuthStore } from '../../stores/auth'
import { usePortfoliosStore } from '../../stores/entities'
import { PortfolioLayout } from './PortfolioLayout'

type Props = {
  portfolioId: string
  tab?: string
}

const VALID_TABS = new Set<PortfolioTab>(['projects', 'progress', 'dashboard', 'workload', 'timeline', 'settings'])

function parseTab(tab?: string): PortfolioTab {
  if (tab && VALID_TABS.has(tab as PortfolioTab)) return tab as PortfolioTab
  return 'projects'
}

export function PortfolioPage({ portfolioId, tab }: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const portfolio = usePortfoliosStore((s) => asEnriched(s.getById(portfolioId)))
  const activeTab = parseTab(tab)

  usePageMeta({
    breadcrumbs:
      portfolio && workspaceId
        ? [
            { label: 'Portfolios', href: `/dashboard/project-management/w/${workspaceId}/portfolios` },
            { label: portfolio.name },
          ]
        : [],
  })

  if (!workspaceId || !currentUserId) return null
  if (!portfolio || portfolio.workspaceId !== workspaceId) {
    return <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Portfolio not found.</p>
  }

  return (
    <PortfolioLayout
      portfolio={portfolio}
      workspaceId={workspaceId}
      currentUserId={currentUserId}
      activeTab={activeTab}
    />
  )
}
