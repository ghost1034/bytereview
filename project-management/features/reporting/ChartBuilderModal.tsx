'use client'

/** Three-step chart builder modal with live preview. */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { computeChart } from '../../lib/reporting/computeChart'
import { encodeScopeFilter, splitScopeFromFilters, type ChartBuilderDraft } from '../../lib/reporting/types'
import type { FilterClause } from '../../lib/query/types'
import { newId } from '../../lib/ids'
import type { Chart, CustomField, Portfolio, Project, SavedView, Section, Tag, Team, User } from '../../types'
import type { ChartComputeContext } from '../../lib/reporting/computeChart'
import { ChartFiltersStep } from './ChartFiltersStep'
import { ChartRenderer } from './ChartRenderer'
import { ChartSourcePicker } from './ChartSourcePicker'
import { ChartTemplatesPanel } from './ChartTemplatesPanel'
import { ChartVisualizationStep } from './ChartVisualizationStep'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Chart
  dataCtx: ChartComputeContext
  projects: Project[]
  portfolios: Portfolio[]
  teams: Team[]
  savedViews: SavedView[]
  customFields: CustomField[]
  members: User[]
  sections: Section[]
  tags: Tag[]
  onSave: (chart: Chart) => void
}

const defaultDraft = (): ChartBuilderDraft => ({
  title: 'Untitled chart',
  type: 'column',
  source: 'tasks',
  filters: [],
  xAxis: 'assigneeId',
  measure: 'count',
  scope: { type: 'workspace' },
})

/** Modal wizard to configure and save a dashboard chart. */
export function ChartBuilderModal({
  open,
  onOpenChange,
  initial,
  dataCtx,
  projects,
  portfolios,
  teams,
  savedViews,
  customFields,
  members,
  sections,
  tags,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ChartBuilderDraft>(() => {
    if (!initial) return defaultDraft()
    const { scope, filters } = splitScopeFromFilters(initial.filters)
    return {
      title: initial.title,
      type: initial.type,
      source: initial.source,
      filters,
      xAxis: initial.xAxis,
      yAxis: initial.yAxis,
      measure: initial.measure,
      measureField: initial.measureField,
      scope,
    }
  })

  const previewChart = useMemo((): Chart => {
    const { scope, ...rest } = draft
    return {
      id: 'preview',
      ...rest,
      filters: encodeScopeFilter(scope, draft.filters as FilterClause[]),
    }
  }, [draft])

  const previewData = useMemo(
    () =>
      computeChart(previewChart, {
        ...dataCtx,
        granularity: draft.granularity,
        topN: draft.topN,
        scopeProjectId: draft.scope.type === 'project' ? draft.scope.id : undefined,
      }),
    [previewChart, dataCtx, draft.granularity, draft.topN, draft.scope]
  )

  const patch = (p: Partial<ChartBuilderDraft>) => setDraft((d) => ({ ...d, ...p }))

  const save = () => {
    const { scope, ...rest } = draft
    onSave({
      id: initial?.id ?? newId(),
      ...rest,
      filters: encodeScopeFilter(scope, draft.filters as FilterClause[]),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-serif">{initial ? 'Edit chart' : 'Add chart'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Tabs defaultValue="source">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="source">Source</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="viz">Visualization</TabsTrigger>
            </TabsList>
            <TabsContent value="source" className="space-y-4 pt-4">
              <ChartSourcePicker
                draft={draft}
                onChange={patch}
                projects={projects}
                portfolios={portfolios}
                teams={teams}
                savedViews={savedViews}
              />
              {!initial ? <ChartTemplatesPanel onPick={(d) => setDraft(d)} /> : null}
            </TabsContent>
            <TabsContent value="filters" className="pt-4">
              <ChartFiltersStep
                draft={draft}
                onChange={patch}
                customFields={customFields}
                members={members}
                sections={sections}
                tags={tags}
              />
            </TabsContent>
            <TabsContent value="viz" className="pt-4">
              <ChartVisualizationStep draft={draft} onChange={patch} />
            </TabsContent>
          </Tabs>
          <div className="tl-card flex flex-col p-3 shadow-paper-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
              Live preview
            </p>
            <div className="min-h-[220px] flex-1">
              <ChartRenderer chart={previewChart} data={previewData} onPointClick={() => undefined} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="tl-btn-primary border-0" onClick={save}>
            Save chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
