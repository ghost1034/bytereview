'use client'

/** PortfolioSettingsTab — edit portfolio metadata and custom fields. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { CreateOrEditPortfolioModal } from './CreateOrEditPortfolioModal'
import { PortfolioCustomFieldsManager } from './PortfolioCustomFieldsManager'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
}

export function PortfolioSettingsTab({ portfolio, workspaceId }: Props) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card text-card-foreground p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-lg">Portfolio details</h2>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{portfolio.description ?? 'No description'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit portfolio</Button>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card text-card-foreground p-5 shadow-sm">
        <PortfolioCustomFieldsManager portfolio={portfolio} />
      </section>
      <CreateOrEditPortfolioModal
        open={editOpen}
        onOpenChange={setEditOpen}
        workspaceId={workspaceId}
        portfolio={portfolio}
      />
    </div>
  )
}
