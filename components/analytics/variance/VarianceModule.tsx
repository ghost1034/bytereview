'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { useAnalyticsVariances } from '@/hooks/useAnalyticsVariance'
import {
  AI_CONTEXT_MAX_ITEMS,
  useAIContext,
  type VarianceContext,
} from '@/lib/analytics/aiContext'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceActiveSummary,
} from '@/lib/analytics/varianceTypes'

import { VarianceEditor } from './VarianceEditor'
import { VarianceList } from './VarianceList'
import { VarianceReports } from './VarianceReports'

type View = 'list' | 'editor' | 'reports'

const HEADER: Record<View, { title: string; description: string }> = {
  list: {
    title: 'Variance & Flux Analysis',
    description:
      'Upload GL data, flag material variances against a threshold, and generate an AI-assisted flux memo.',
  },
  editor: {
    title: 'Variance & Flux Analysis',
    description: 'Upload, map, configure thresholds, then review flagged variances and the memo.',
  },
  reports: {
    title: 'Variance reports',
    description: 'Cross-analysis rollup of flagged variances and review status.',
  },
}

export function VarianceModule() {
  const { data, isLoading } = useAnalyticsVariances()
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
  const [activeSummary, setActiveSummary] = useState<VarianceActiveSummary | null>(null)

  const rows = useMemo<AnalyticsAnalysis[]>(() => data?.analyses ?? [], [data])
  const filtered = useMemo(
    () => (clientFilter ? rows.filter((r) => r.client_id === clientFilter) : rows),
    [rows, clientFilter],
  )

  const aiContext = useMemo<VarianceContext>(() => {
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]))
    return {
      variance: {
        count: rows.length,
        items: rows.slice(0, AI_CONTEXT_MAX_ITEMS).map((r) => {
          const config = readVarianceConfig(r)
          const data = readVarianceData(r)
          const processed = data.processed ?? []
          return {
            id: r.id,
            name: r.name,
            status: r.status,
            client: r.client_id ? clientNameById.get(r.client_id) : undefined,
            analysisType: config.uploadMode === 'single' ? 'Single Period' : 'Base vs Comparison',
            flaggedCount: processed.filter((p) => p.isFlagged).length,
            reviewedCount: processed.filter((p) => p.status !== 'Pending').length,
          }
        }),
        ...(activeSummary
          ? {
              active: {
                id: activeSummary.id,
                step: activeSummary.step,
                flaggedCount: activeSummary.flaggedCount,
                totalRows: activeSummary.totalRows,
                thresholdDollar: activeSummary.thresholdDollar,
                thresholdPercent: activeSummary.thresholdPercent,
              },
            }
          : {}),
      },
    }
  }, [rows, clients, activeSummary])
  useAIContext(aiContext)

  const handleOpen = useCallback((row: AnalyticsAnalysis) => {
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
        <LoadingState variant="table" label="Loading variance analyses" />
      ) : view === 'editor' && editingId ? (
        <VarianceEditor
          analysisId={editingId}
          onBack={goList}
          onSummaryChange={setActiveSummary}
        />
      ) : view === 'reports' ? (
        <VarianceReports rows={filtered} clients={clients} onBack={goList} />
      ) : (
        <VarianceList
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

export default VarianceModule
