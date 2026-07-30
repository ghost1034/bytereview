'use client'

/** 12-column draggable/resizable dashboard chart grid. */
import { useEffect } from 'react'
import type { Chart, Dashboard } from '../../types'
import type { ChartComputeContext } from '../../lib/reporting/computeChart'
import { GRID_COLS, ROW_HEIGHT, useGridLayout } from './useGridLayout'
import { ChartCard } from './ChartCard'

type Props = {
  charts: Chart[]
  layout: Dashboard['layout']
  dataCtx: ChartComputeContext
  basePath: string
  onLayoutChange: (layout: Dashboard['layout']) => void
  onEditChart: (chart: Chart) => void
  onDeleteChart: (chartId: string) => void
}

/** Responsive grid of chart tiles with persisted layout. */
export function DashboardGrid({
  charts,
  layout,
  dataCtx,
  basePath,
  onLayoutChange,
  onEditChart,
  onDeleteChart,
}: Props) {
  const { gridRef, dragId, onDragStart, onDragEnd, onResizeStart, onPointerMove } = useGridLayout({
    layout,
    onChange: onLayoutChange,
  })

  useEffect(() => {
    if (!dragId) return
    const move = (e: PointerEvent) => {
      if (e.buttons === 1) onPointerMove(e.clientX, e.clientY)
    }
    const up = () => onDragEnd()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragId, onPointerMove, onDragEnd])

  const maxRow = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)

  return (
    <div
      ref={gridRef}
      className="relative w-full print:block"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_HEIGHT}px`,
        minHeight: Math.max(maxRow, 4) * ROW_HEIGHT,
        gap: 8,
      }}
    >
      {layout.map((item) => {
        const chart = charts.find((c) => c.id === item.chartId)
        if (!chart) return null
        return (
          <div
            key={item.chartId}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
            }}
          >
            <ChartCard
              chart={chart}
              layout={item}
              dataCtx={dataCtx}
              basePath={basePath}
              onEdit={() => onEditChart(chart)}
              onDelete={() => onDeleteChart(chart.id)}
              onDragStart={(x, y) => onDragStart(item, x, y)}
              onResizeStart={(x, y) => onResizeStart(item, x, y)}
            />
          </div>
        )
      })}
    </div>
  )
}
