'use client'

/** Dashboard grid tile wrapping a chart with edit menu. */
import { useMemo, useState } from 'react'
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { computeChart } from '../../lib/reporting/computeChart'
import type { ChartComputeContext } from '../../lib/reporting/computeChart'
import type { Chart, Dashboard } from '../../types'
import { ChartRenderer } from './ChartRenderer'
import { DrillDownPanel } from './DrillDownPanel'

type Props = {
  chart: Chart
  layout: Dashboard['layout'][number]
  dataCtx: ChartComputeContext
  basePath: string
  editable: boolean
  onEdit: () => void
  onDelete: () => void
  onDragStart: (clientX: number, clientY: number) => void
  onResizeStart: (clientX: number, clientY: number) => void
}

/** Single draggable chart card inside the dashboard grid. */
export function ChartCard({
  chart,
  dataCtx,
  basePath,
  editable,
  onEdit,
  onDelete,
  onDragStart,
  onResizeStart,
}: Props) {
  const data = useMemo(() => computeChart(chart, dataCtx), [chart, dataCtx])
  const [drill, setDrill] = useState<{ ids: string[]; label: string } | null>(null)

  return (
    <>
      <div className="tl-card relative flex h-full flex-col overflow-hidden shadow-paper-sm">
        <div
          className={`flex items-center justify-between border-b px-2 py-1.5 ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{ borderColor: 'var(--border-subtle)' }}
          onPointerDown={editable ? (e) => onDragStart(e.clientX, e.clientY) : undefined}
        >
          <div className="flex items-center gap-1 text-sm font-medium">
            <GripVertical className="h-3.5 w-3.5 opacity-40" />
            {chart.title}
          </div>
          {editable ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="tl-popover-surface" align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : null}
        </div>
        <div className="min-h-0 flex-1 p-2">
          <ChartRenderer
            chart={chart}
            data={data}
            onPointClick={(ids, label) => setDrill({ ids, label })}
          />
          {data.kind === 'categorical' ? (
            <div className="sr-only focus-within:not-sr-only">
              {data.points.map((point) => (
                <button key={point.key} type="button" onClick={() => setDrill({ ids: point.recordIds, label: point.label })}>
                  View {point.label} records
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {editable ? <div
          className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm border"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeStart(e.clientX, e.clientY)
          }}
        /> : null}
      </div>
      {drill ? (
        <DrillDownPanel
          chart={chart}
          recordIds={drill.ids}
          label={drill.label}
          basePath={basePath}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </>
  )
}
