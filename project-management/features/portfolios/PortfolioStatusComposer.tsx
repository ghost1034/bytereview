'use client'

/** PortfolioStatusComposer — status pill, due indicator, composer entry. */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { isStatusUpdateDue } from '../status/summaries'
import { StatusUpdateCard } from '../status/StatusUpdateCard'
import { ProjectStatusPill } from '../projects/ProjectStatusPill'
import { PortfolioStatusDialog } from './PortfolioStatusDialog'
import { PortfolioStatusHistory } from './PortfolioStatusHistory'

type Props = {
  portfolio: EnrichedPortfolio
  currentUserId: string
}

export function PortfolioStatusComposer({ portfolio, currentUserId }: Props) {
  const users = useUsersStore((s) => s.list())
  const scope = useMemo(() => ({ type: 'portfolio' as const, id: portfolio.id }), [portfolio.id])
  const latest = useStatusUpdatesStore((s) => {
    const rows = s.list().filter((u) => u.scope.type === scope.type && u.scope.id === scope.id)
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  })
  const statusDue = useMemo(() => isStatusUpdateDue(scope), [scope, latest?.createdAt])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('updates') === '1') setHistoryOpen(true)
  }, [searchParams])

  const author = latest ? users.find((u) => u.id === latest.authorId) : undefined

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusPill status={portfolio.status} />
          {statusDue ? (
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="h-3 w-3" /> Status due
            </Badge>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>Update status</Button>
      </div>
      {!latest ? (
        <p className="mt-3 text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Share a portfolio-wide status update with stakeholders.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>Latest update</p>
          <StatusUpdateCard update={latest} author={author} compact />
          <button type="button" className="text-xs underline" style={{ color: 'hsl(var(--primary))' }} onClick={() => setHistoryOpen(true)}>
            View all updates
          </button>
        </div>
      )}
      <PortfolioStatusDialog portfolio={portfolio} currentUserId={currentUserId} open={dialogOpen} onOpenChange={setDialogOpen} />
      <PortfolioStatusHistory portfolioId={portfolio.id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
