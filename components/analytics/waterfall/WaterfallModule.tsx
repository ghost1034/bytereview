'use client'

import { useMemo, useState } from 'react'
import { Droplet, Plus, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { useAnalyticsWaterfalls } from '@/hooks/useAnalyticsWaterfall'
import {
  AI_CONTEXT_MAX_ITEMS,
  useAIContext,
  type WaterfallContext,
} from '@/lib/analytics/aiContext'
import { currentMonthKey } from '@/lib/analytics/format'
import { rollupAsOf, toSavedWaterfall, type SavedWaterfall } from '@/lib/analytics/waterfallData'
import { WaterfallBulkUpload } from './WaterfallBulkUpload'
import { WaterfallForm } from './WaterfallForm'
import { WaterfallList } from './WaterfallList'
import { WaterfallMonthlyJournal } from './WaterfallMonthlyJournal'
import { WaterfallReports } from './WaterfallReports'
import { WriteOffDialog } from './WriteOffDialog'

type View = 'list' | 'create' | 'reports' | 'bulk' | 'journal'

const HEADER: Record<View, { title: string; description: string }> = {
  list: {
    title: 'Waterfall',
    description: 'Build revenue-recognition and deferral schedules with auto-generated journal entries.',
  },
  create: { title: 'Waterfall schedule', description: 'Configure a schedule and review its recognition and journal entries.' },
  reports: { title: 'Waterfall reports', description: 'Export consolidated schedule detail and monthly recognition summaries.' },
  bulk: { title: 'Bulk upload', description: 'Import multiple schedules from a CSV or Excel file.' },
  journal: {
    title: 'Monthly journal entries',
    description: "Book every contract's recognition for a chosen month as one consolidated journal.",
  },
}

export function WaterfallModule() {
  const { data, isLoading } = useAnalyticsWaterfalls()
  const { data: clientsData } = useAnalyticsClients()
  const clients = clientsData?.clients ?? []

  const [view, setView] = useState<View>('list')
  const [editing, setEditing] = useState<SavedWaterfall | null>(null)
  const [writeOffTarget, setWriteOffTarget] = useState<SavedWaterfall | null>(null)
  const [asOf, setAsOf] = useState(currentMonthKey())
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  const saved = useMemo<SavedWaterfall[]>(
    () => (data?.analyses ?? []).map(toSavedWaterfall),
    [data],
  )

  const filtered = useMemo(
    () => (clientFilter ? saved.filter((w) => w.clientId === clientFilter) : saved),
    [saved, clientFilter],
  )

  const rollups = useMemo(
    () => filtered.map((w) => rollupAsOf(w, asOf)),
    [filtered, asOf],
  )

  // Publish all schedules (rolled up as-of) to the floating AI assistant.
  const aiContext = useMemo<WaterfallContext>(() => {
    const items = saved.slice(0, AI_CONTEXT_MAX_ITEMS).map((w) => {
      const r = rollupAsOf(w, asOf)
      return {
        id: w.id,
        name: w.name,
        subtype: w.form.type,
        party: w.form.partyName,
        totalAmount: w.form.totalAmount,
        recognizedToDate: r.recognizedToDate,
        currentBalance: r.currentBalance,
        startDate: w.form.startDate,
        endDate: w.form.endDate,
      }
    })
    return { waterfall: { count: saved.length, asOf, items } }
  }, [saved, asOf])
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
          view === 'list' && saved.length > 0 ? (
            <Button onClick={() => setView('create')}>
              <Plus className="mr-1.5 size-4" aria-hidden /> New schedule
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState variant="table" label="Loading waterfall schedules" />
      ) : view === 'create' ? (
        <WaterfallForm initial={editing} onDone={goList} />
      ) : view === 'reports' ? (
        <WaterfallReports rows={filtered} onBack={goList} />
      ) : view === 'journal' ? (
        <WaterfallMonthlyJournal rows={filtered} onBack={goList} />
      ) : view === 'bulk' ? (
        <WaterfallBulkUpload onBack={goList} />
      ) : saved.length === 0 ? (
        <EmptyState
          icon={Droplet}
          title="No schedules yet"
          description="Create a deferral or recognition schedule, or import several at once."
          action={
            <Button onClick={() => setView('create')}>
              <Plus className="mr-1.5 size-4" aria-hidden /> New schedule
            </Button>
          }
          secondaryAction={
            <Button variant="outline" onClick={() => setView('bulk')}>
              <Upload className="mr-1.5 size-4" aria-hidden /> Bulk upload
            </Button>
          }
        />
      ) : (
        <WaterfallList
          rows={rollups}
          clients={clients}
          asOf={asOf}
          onAsOfChange={setAsOf}
          clientFilter={clientFilter}
          onClientFilterChange={setClientFilter}
          onNew={() => setView('create')}
          onBulk={() => setView('bulk')}
          onReports={() => setView('reports')}
          onJournal={() => setView('journal')}
          onEdit={(row) => {
            setEditing(row)
            setView('create')
          }}
          onWriteOff={(row) => setWriteOffTarget(row)}
        />
      )}

      <WriteOffDialog waterfall={writeOffTarget} onClose={() => setWriteOffTarget(null)} />
    </div>
  )
}

export default WaterfallModule
