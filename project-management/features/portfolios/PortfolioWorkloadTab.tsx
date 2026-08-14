'use client'

/** PortfolioWorkloadTab — scaffold; full workload view ships in step 25. */
import Link from 'next/link'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
}

export function PortfolioWorkloadTab({ portfolio, workspaceId }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-col items-center p-10 text-center shadow-sm">
      <Users className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />
      <h3 className="font-sans text-lg">Portfolio workload</h3>
      <p className="mt-2 max-w-md text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Cross-project workload for <strong>{portfolio.name}</strong> will be available in the Workload module (step 25).
        Use the workspace workload view in the meantime.
      </p>
      <Button asChild className="mt-4" variant="outline" size="sm">
        <Link href={`/dashboard/project-management/w/${workspaceId}/workload`}>Open workspace workload</Link>
      </Button>
    </div>
  )
}
