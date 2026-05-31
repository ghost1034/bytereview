'use client'

import { useMemo, useState } from 'react'
import { Calculator, Plus, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { ClientSelector, type ClientSelection } from '@/components/analytics/ClientSelector'
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
import { AmortizationJournalEntriesView } from './AmortizationJournalEntriesView'
import { AmortizationList } from './AmortizationList'
import { AmortizationReports } from './AmortizationReports'
import { DisposalDialog } from './DisposalDialog'

type View = 'client' | 'list' | 'create' | 'reports' | 'bulk' | 'journal'

const HEADER: Record<View, { title: string; description: string }> = {
  client: {
    title: 'Fixed Assets',
    description: 'Select a client to start the fixed assets workflow.',
  },
  list: {
    title: 'Fixed Assets',
    description:
      'Manage fixed assets, leases, loans, intangibles, and software with GAAP + tax schedules and auto-generated journal entries.',
  },
  create: {
    title: 'Asset',
    description: 'Configure an asset and preview its GAAP and tax schedules.',
  },
  reports: {
    title: 'Fixed assets reports',
    description: 'Export schedules, summaries, registers, and disposal gain/loss.',
  },
  bulk: {
    title: 'Bulk upload',
    description: 'Import multiple assets from a CSV or Excel file.',
  },
  journal: {
    title: 'Journal entries',
    description: 'Period-end journal entries derived from every asset schedule.',
  },
}

export function AmortizationModule() {
  const { data, isLoading } = useAnalyticsAmortizations()
  const { data: clientsData } = useAnalyticsClients()
  const clients = useMemo(() => clientsData?.clients ?? [], [clientsData])

  const [view, setView] = useState<View>('client')
  const [editing, setEditing] = useState<AnalyticsAmortization | null>(null)
  const [disposalTarget, setDisposalTarget] = useState<AnalyticsAmortization | null>(null)
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  const handleSelectClient = (selection: ClientSelection) => {
    setClientFilter(selection.id === 'general' ? null : selection.id)
    setView('list')
  }

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

  if (view === 'client') {
    return (
      <ClientSelector
        onSelectClient={handleSelectClient}
        title="Fixed Assets"
        description="Select a client to start the fixed assets workflow."
        allowGeneral
      />
    )
  }

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
        <AmortizationForm initial={editing} initialClientId={clientFilter} onDone={goList} />
      ) : view === 'reports' ? (
        <AmortizationReports rows={filtered} clients={clients} onBack={goList} />
      ) : view === 'bulk' ? (
        <AmortizationBulkUpload onBack={goList} />
      ) : view === 'journal' ? (
        <AmortizationJournalEntriesView rows={filtered} clients={clients} onBack={goList} />
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
          onChangeClient={() => setView('client')}
          onNew={() => setView('create')}
          onBulk={() => setView('bulk')}
          onReports={() => setView('reports')}
          onJournal={() => setView('journal')}
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
