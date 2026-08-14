'use client'

/** Single dashboard page with grid, sharing, export, and digest. */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Copy, Download, Plus, Printer, Share2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { normalizeUnknownError } from '../../lib/errors'
import { appendChartToDashboard, duplicateDashboard } from '../../lib/reporting/dashboardActions'
import { exportDashboardPng, exportDashboardPrint } from '../../lib/reporting/exportDashboard'
import type { ReportingDashboard } from '../../lib/reporting/types'
import { canEditDashboard, canManageDashboardSharing, canViewDashboard } from '../../lib/reporting/dashboardPermissions'
import { now } from '../../lib/time'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useAuthStore } from '../../stores/auth'
import { useDashboardsStore } from '../../stores/entities'
import { ChartBuilderModal } from './ChartBuilderModal'
import { DashboardGrid } from './DashboardGrid'
import { ScheduleDigestDialog } from './ScheduleDigestDialog'
import { ShareDashboardDialog } from './ShareDashboardDialog'
import { useReportingData } from './useReportingData'
import type { Chart } from '../../types'
import {
  useCustomFieldsStore,
  usePortfoliosStore,
  useProjectsStore,
  useSavedViewsStore,
  useSectionsStore,
  useTagsStore,
  useUsersStore,
} from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'

type Props = {
  workspaceId: string
  dashboardId: string
  basePath: string
  returnHref?: string
  breadcrumbLabel?: string
  fixedProjectId?: string
}

/** Dashboard detail with editable title, chart grid, and actions. */
export function DashboardPage({ workspaceId, dashboardId, basePath, returnHref, breadcrumbLabel, fixedProjectId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const gridRef = useRef<HTMLDivElement>(null)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const dashboard = useDashboardsStore((s) => s.getById(dashboardId)) as ReportingDashboard | undefined
  const update = useDashboardsStore((s) => s.update)
  const remove = useDashboardsStore((s) => s.remove)
  const add = useDashboardsStore((s) => s.add)
  const dataCtx = useReportingData(workspaceId)
  const { teams, workspace } = useWorkspaceContext()

  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const portfolios = usePortfoliosStore((s) => s.list().filter((p) => p.workspaceId === workspaceId))
  const savedViews = useSavedViewsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const members = useUsersStore((s) => s.list())
  const sections = useSectionsStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())

  const [builderOpen, setBuilderOpen] = useState(false)
  const [editChart, setEditChart] = useState<Chart | undefined>()
  const [shareOpen, setShareOpen] = useState(false)
  const [digestOpen, setDigestOpen] = useState(false)
  const [title, setTitle] = useState(dashboard?.name ?? '')
  const [exporting, setExporting] = useState(false)
  const canView = dashboard ? canViewDashboard(dashboard, currentUserId, workspace) : false
  const canEdit = dashboard ? canEditDashboard(dashboard, currentUserId, workspace) : false
  const canShare = dashboard ? canManageDashboardSharing(dashboard, currentUserId, workspace) : false

  usePageMeta({
    breadcrumbs: [
      { label: 'Tasklytic', href: `${basePath}/home` },
      ...(breadcrumbLabel ? [{ label: 'Projects', href: `${basePath}/projects` }] : []),
      { label: breadcrumbLabel ?? 'Reporting', href: returnHref ?? `${basePath}/reporting` },
      { label: dashboard?.name ?? 'Dashboard' },
    ],
  })

  if (!dashboard || dashboard.workspaceId !== workspaceId || !dataCtx || !canView) {
    return (
      <div className="tl-card p-8 text-center shadow-paper-sm">
        <p style={{ color: 'var(--ink-muted)' }}>Dashboard not found.</p>
      </div>
    )
  }

  const saveTitle = async () => {
    if (canEdit && title.trim() && title !== dashboard.name) {
      await update(dashboard.id, { name: title.trim(), updatedAt: now() } as Partial<ReportingDashboard>)
    }
  }

  const saveChart = async (chart: Chart) => {
    const charts = editChart
      ? dashboard.charts.map((c) => (c.id === chart.id ? chart : c))
      : [...dashboard.charts, chart]
    const patch = editChart
      ? { charts, updatedAt: now() }
      : { ...appendChartToDashboard(dashboard, chart), updatedAt: now() }
    await update(dashboard.id, patch as Partial<ReportingDashboard>)
    setEditChart(undefined)
  }

  const deleteChart = async (chartId: string) => {
    await update(dashboard.id, {
      charts: dashboard.charts.filter((c) => c.id !== chartId),
      layout: dashboard.layout.filter((l) => l.chartId !== chartId),
      updatedAt: now(),
    } as Partial<ReportingDashboard>)
  }

  const handleExportPng = async () => {
    if (!gridRef.current || exporting) return
    setExporting(true)
    try {
      await exportDashboardPng(gridRef.current, `${dashboard.name}.png`)
    } catch (cause) {
      const error = normalizeUnknownError(cause, 'The dashboard could not be exported.')
      console.error('Tasklytic dashboard export failed:', error)
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <Input
          className="max-w-md border-0 bg-transparent font-serif text-2xl shadow-none focus-visible:ring-0"
          value={title}
          readOnly={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
        />
        <div className="flex flex-wrap gap-2">
          {canShare ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              if (!currentUserId) return
              const copy = duplicateDashboard(dashboard, currentUserId)
              await add(copy)
              router.push(`${basePath}/reporting/${copy.id}`)
            }}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={exporting}
            onClick={() => void handleExportPng()}
          >
            <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export PNG'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportDashboardPrint}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
          {canEdit ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDigestOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Schedule digest
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={async () => {
                  await remove(dashboard.id)
                  router.push(returnHref ?? `${basePath}/reporting`)
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button
                className="tl-btn-primary gap-1.5 border-0"
                size="sm"
                onClick={() => {
                  setEditChart(undefined)
                  setBuilderOpen(true)
                }}
              >
                <Plus className="h-4 w-4" /> Add chart
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div ref={gridRef}>
        {dashboard.charts.length ? (
          <DashboardGrid
            charts={dashboard.charts}
            layout={dashboard.layout}
            dataCtx={dataCtx}
            basePath={basePath}
            editable={canEdit}
            onLayoutChange={(layout) => void update(dashboard.id, { layout, updatedAt: now() } as Partial<ReportingDashboard>)}
            onEditChart={(chart) => {
              setEditChart(chart)
              setBuilderOpen(true)
            }}
            onDeleteChart={(id) => void deleteChart(id)}
          />
        ) : (
          <div className="tl-card p-12 text-center shadow-paper-sm">
            <p className="font-serif text-lg">This dashboard is waiting for its first chart</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
              Add a chart or pick a recommended template to get started.
            </p>
            {canEdit ? (
              <Button className="tl-btn-primary mt-4 border-0" onClick={() => setBuilderOpen(true)}>
                Add chart
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {canEdit ? <ChartBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        initial={editChart}
        dataCtx={dataCtx}
        projects={projects}
        portfolios={portfolios}
        teams={teams}
        savedViews={savedViews}
        customFields={customFields}
        members={members}
        sections={sections}
        tags={tags}
        onSave={(chart) => void saveChart(chart)}
        fixedProjectId={fixedProjectId}
      /> : null}
      {canShare ? <ShareDashboardDialog open={shareOpen} onOpenChange={setShareOpen} dashboard={dashboard} /> : null}
      {canEdit ? <ScheduleDigestDialog open={digestOpen} onOpenChange={setDigestOpen} dashboard={dashboard} /> : null}
    </div>
  )
}
