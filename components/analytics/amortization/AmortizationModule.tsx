'use client'

import { useMemo, useState } from 'react'
import { Calculator, Plus, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useAnalyticsAmortizations } from '@/hooks/useAnalyticsAmortization'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { computeNbv, summarizePortfolio } from '@/lib/analytics/amortizationHelpers'
import {
  AI_CONTEXT_MAX_ITEMS,
  useAIContext,
  type AmortizationContext,
} from '@/lib/analytics/aiContext'
import type { AnalyticsAmortization } from '@/lib/analytics/types'
import { AmortizationBulkUpload } from './AmortizationBulkUpload'
import { AmortizationForm } from './AmortizationForm'
import { AmortizationList } from './AmortizationList'
import { AmortizationReports } from './AmortizationReports'
import { DisposalDialog } from './DisposalDialog'

type View = 'list' | 'create' | 'reports' | 'bulk'

const HEADER: Record<View, { title: string; description: string }> = {
  list: {
    title: 'Amortization',
    description:
      'Manage fixed assets, leases, loans, intangibles, and software with GAAP + tax schedules and auto-generated journal entries.',
  },
  create: {
    title: 'Asset',
    description: 'Configure an asset and preview its GAAP and tax schedules.',
  },
  reports: {
    title: 'Amortization reports',
    description: 'Export schedules, summaries, registers, and disposal gain/loss.',
  },
  bulk: {
    title: 'Bulk upload',
    description: 'Import multiple assets from a CSV or Excel file.',
  },
}

export function AmortizationModule() {
  const { data, isLoading } = useAnalyticsAmortizations()
  const { data: clientsData } = useAnalyticsClients()
  const clients = useMemo(() => clientsData?.clients ?? [], [clientsData])

  const [view, setView] = useState<View>('list')
  const [editing, setEditing] = useState<AnalyticsAmortization | null>(null)
  const [disposalTarget, setDisposalTarget] = useState<AnalyticsAmortization | null>(null)
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  const rows = useMemo<AnalyticsAmortization[]>(() => data?.amortizations ?? [], [data])
  const filtered = useMemo(
    () => (clientFilter ? rows.filter((r) => r.client_id === clientFilter) : rows),
    [rows, clientFilter],
  )

  // Publish AI context for the floating assistant.
  const aiContext = useMemo<AmortizationContext>(() => {
    const today = new Date().toISOString().split('T')[0]
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]))
    const summary = summarizePortfolio(rows, today)
    return {
      amortization: {
        count: rows.length,
        asOf: today,
        totals: {
          costBasis: summary.totalCostBasis,
          nbv: summary.totalNbv,
          monthlyExpense: summary.monthlyExpense,
        },
        items: rows.slice(0, AI_CONTEXT_MAX_ITEMS).map((r) => ({
          id: r.id,
          assetName: r.asset_name,
          assetType: r.asset_type,
          costBasis: r.cost_basis ?? 0,
          nbv: computeNbv(r, today),
          gaapMethod: r.gaap_method ?? undefined,
          taxMethod: r.tax_method ?? undefined,
          status: r.status ?? undefined,
          startDate: r.start_date ?? undefined,
          client: r.client_id ? clientNameById.get(r.client_id) : undefined,
        })),
      },
    }
  }, [rows, clients])
  useAIContext(aiContext)

  const goList = () => {
    setEditing(null)
    setView('list')
  }

  const header = HEADER[view]

  return (
    <div className="space-y-8">
      <PageHeader
        title={header.title}
        description={header.description}
        actions={
          view === 'list' && rows.length > 0 ? (
            <Button onClick={() => setView('create')}>
              <Plus className="mr-1.5 size-4" aria-hidden /> New asset
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState variant="table" label="Loading assets" />
      ) : view === 'create' ? (
        <AmortizationForm initial={editing} onDone={goList} />
      ) : view === 'reports' ? (
        <AmortizationReports rows={filtered} clients={clients} onBack={goList} />
      ) : view === 'bulk' ? (
        <AmortizationBulkUpload onBack={goList} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No assets yet"
          description="Add your first asset, lease, or loan, or import several at once."
          action={
            <Button onClick={() => setView('create')}>
              <Plus className="mr-1.5 size-4" aria-hidden /> New asset
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onClick={() => setView('bulk')}>
              <Upload className="mr-1.5 size-4" aria-hidden /> Bulk upload
            </Button>
          }
        />
      ) : (
        <AmortizationList
          rows={filtered}
          clients={clients}
          clientFilter={clientFilter}
          onClientFilterChange={setClientFilter}
          onNew={() => setView('create')}
          onBulk={() => setView('bulk')}
          onReports={() => setView('reports')}
          onEdit={(row) => {
            setEditing(row)
            setView('create')
          }}
          onDispose={(row) => setDisposalTarget(row)}
        />
      )}

      <DisposalDialog asset={disposalTarget} onClose={() => setDisposalTarget(null)} />
    </div>
  )
}

export default AmortizationModule
