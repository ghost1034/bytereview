'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { useAnalyticsReconciliations } from '@/hooks/useAnalyticsReconciliation'
import {
  AI_CONTEXT_MAX_ITEMS,
  useAIContext,
  type ReconciliationContext,
} from '@/lib/analytics/aiContext'
import type {
  ReconciliationMatchGroup,
  ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'
import type { AnalyticsReconciliation } from '@/lib/analytics/types'
import {
  ReconciliationEditor,
  type ReconciliationActiveSummary,
} from './ReconciliationEditor'
import { ReconciliationList } from './ReconciliationList'
import { ReconciliationReports } from './ReconciliationReports'

type View = 'list' | 'editor' | 'reports'

const HEADER: Record<View, { title: string; description: string }> = {
  list: {
    title: 'Reconciliation',
    description:
      'Match transactions between two sources using AI-generated rules, then approve, reject, and export.',
  },
  editor: {
    title: 'Reconciliation',
    description: 'Upload sources, tune matching rules, and review match groups.',
  },
  reports: {
    title: 'Reconciliation reports',
    description: 'Status rollup and cross-reconciliation exports.',
  },
}

export function ReconciliationModule() {
  const { data, isLoading } = useAnalyticsReconciliations()
  const { data: clientsData } = useAnalyticsClients()
  const clients = useMemo(() => clientsData?.clients ?? [], [clientsData])

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const deepLinkId = searchParams.get('id')
  const openedDeepLinkRef = useRef<string | null>(null)

  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState<string | null>(null)
  const [activeSummary, setActiveSummary] = useState<ReconciliationActiveSummary | null>(null)

  const rows = useMemo<AnalyticsReconciliation[]>(
    () => data?.reconciliations ?? [],
    [data],
  )
  const filtered = useMemo(
    () => (clientFilter ? rows.filter((r) => r.client_id === clientFilter) : rows),
    [rows, clientFilter],
  )

  const aiContext = useMemo<ReconciliationContext>(() => {
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]))
    return {
      reconciliation: {
        count: rows.length,
        items: rows.slice(0, AI_CONTEXT_MAX_ITEMS).map((r) => {
          const sourceA = (r.source_a ?? []) as unknown as ReconciliationTransaction[]
          const sourceB = (r.source_b ?? []) as unknown as ReconciliationTransaction[]
          const groups = (r.match_groups ?? []) as unknown as ReconciliationMatchGroup[]
          return {
            id: r.id,
            name: r.name,
            status: r.status,
            client: r.client_id ? clientNameById.get(r.client_id) : undefined,
            sourceACount: sourceA.length,
            sourceBCount: sourceB.length,
            matchGroupCount: groups.length,
            unmatchedCount:
              sourceA.filter((t) => t.status === 'unmatched').length +
              sourceB.filter((t) => t.status === 'unmatched').length,
          }
        }),
        ...(activeSummary
          ? {
              active: {
                id: activeSummary.id,
                step: activeSummary.step,
                matchedGroups: activeSummary.matchedGroups,
                approvedGroups: activeSummary.approvedGroups,
                rejectedGroups: activeSummary.rejectedGroups,
                unmatchedA: activeSummary.unmatchedA,
                unmatchedB: activeSummary.unmatchedB,
              },
            }
          : {}),
      },
    }
  }, [rows, clients, activeSummary])
  useAIContext(aiContext)

  const handleOpen = useCallback((row: AnalyticsReconciliation) => {
    setEditingId(row.id)
    setView('editor')
  }, [])

  const goList = useCallback(() => {
    setEditingId(null)
    setActiveSummary(null)
    setView('list')
    if (searchParams.get('id')) {
      router.replace(pathname)
    }
  }, [router, pathname, searchParams])

  useEffect(() => {
    if (!deepLinkId) return
    if (openedDeepLinkRef.current === deepLinkId) return
    const match = rows.find((r) => r.id === deepLinkId)
    if (!match) return
    openedDeepLinkRef.current = deepLinkId
    handleOpen(match)
  }, [deepLinkId, rows, handleOpen])

  const header = HEADER[view]

  return (
    <div className="space-y-8">
      <PageHeader title={header.title} description={header.description} />

      {isLoading ? (
        <LoadingState variant="table" label="Loading reconciliations" />
      ) : view === 'editor' && editingId ? (
        <ReconciliationEditor
          reconciliationId={editingId}
          onBack={goList}
          onSummaryChange={setActiveSummary}
        />
      ) : view === 'reports' ? (
        <ReconciliationReports rows={filtered} clients={clients} onBack={goList} />
      ) : (
        <ReconciliationList
          rows={filtered}
          clients={clients}
          clientFilter={clientFilter}
          onClientFilterChange={setClientFilter}
          onReports={() => setView('reports')}
          onOpen={handleOpen}
        />
      )}
    </div>
  )
}

export default ReconciliationModule
