'use client'

/** Recharts chart renderer with warm palette and drill-down clicks. */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { Chart } from '../../types'
import { WARM_CHART_PALETTE } from '../../lib/reporting/palette'
import type { ChartComputed, ChartPoint } from '../../lib/reporting/types'

type Props = {
  chart: Chart
  data: ChartComputed
  compact?: boolean
  onPointClick: (recordIds: string[], label: string) => void
}

function configFromPoints(points: ChartPoint[]): ChartConfig {
  const cfg: ChartConfig = {}
  points.forEach((p, i) => {
    cfg[p.key] = { label: p.label, color: p.color ?? WARM_CHART_PALETTE[i % WARM_CHART_PALETTE.length] }
  })
  return cfg
}

/** Render bar, column, line, donut, lollipop, number, and burnup charts. */
export function ChartRenderer({ chart, data, compact, onPointClick }: Props) {
  const height = compact ? 'h-full min-h-[48px]' : 'h-full min-h-[180px]'

  if (data.kind === 'number') {
    return (
      <div className={`flex flex-col items-center justify-center ${height} p-2`}>
        <p className="font-serif text-4xl tabular-nums" style={{ color: 'var(--ink-primary)' }}>
          {Math.round(data.value)}
        </p>
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
          {data.subtitle}
        </p>
      </div>
    )
  }

  if (data.kind === 'burnup') {
    const cfg = {
      total: { label: 'Scope', color: WARM_CHART_PALETTE[3] },
      completed: { label: 'Completed', color: WARM_CHART_PALETTE[1] },
    } satisfies ChartConfig
    return (
      <ChartContainer config={cfg} className={`w-full ${height}`}>
        <LineChart data={data.points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: compact ? 8 : 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="total" stroke="var(--color-total)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" dot={false} strokeWidth={2} />
        </LineChart>
      </ChartContainer>
    )
  }

  if (data.kind === 'timeseries') {
    const cfg = { y: { label: chart.title, color: WARM_CHART_PALETTE[0] } } satisfies ChartConfig
    return (
      <ChartContainer config={cfg} className={`w-full ${height}`}>
        <LineChart data={data.points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: compact ? 8 : 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="y"
            stroke="var(--color-y)"
            dot={!compact}
            onClick={(pt) => {
              const payload = pt as { recordIds?: string[]; label?: string }
              onPointClick(payload.recordIds ?? [], String(payload.label ?? ''))
            }}
          />
        </LineChart>
      </ChartContainer>
    )
  }

  const points = data.points
  const cfg = configFromPoints(points)
  if (!points.length) {
    return (
      <p className={`flex items-center justify-center text-sm italic ${height}`} style={{ color: 'var(--ink-muted)' }}>
        No data
      </p>
    )
  }

  if (chart.type === 'donut') {
    return (
      <ChartContainer config={cfg} className={`mx-auto w-full ${compact ? 'max-h-16' : 'max-w-[280px]'} ${height}`}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
          <Pie
            data={points}
            dataKey="value"
            nameKey="label"
            innerRadius={compact ? 16 : 56}
            outerRadius={compact ? 28 : 80}
            paddingAngle={2}
            onClick={(_, index) => onPointClick(points[index]?.recordIds ?? [], points[index]?.label ?? '')}
          >
            {points.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
            {!compact ? (
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan className="fill-foreground font-serif text-2xl">{data.total}</tspan>
                    </text>
                  )
                }}
              />
            ) : null}
          </Pie>
        </PieChart>
      </ChartContainer>
    )
  }

  const horizontal = chart.type === 'bar' || chart.type === 'lollipop'
  const ChartImpl = horizontal ? BarChart : BarChart
  const layout = horizontal ? 'vertical' : 'horizontal'

  return (
    <ChartContainer config={cfg} className={`w-full ${height}`}>
      <ChartImpl
        data={points}
        layout={layout as 'vertical' | 'horizontal'}
        margin={{ left: horizontal ? 80 : 4, right: 8, top: 8, bottom: compact ? 0 : 24 }}
      >
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 10 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fontSize: compact ? 8 : 10 }} interval={0} angle={compact ? 0 : -15} textAnchor="end" height={compact ? 24 : 48} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        {!compact ? <ChartLegend content={<ChartLegendContent />} /> : null}
        <Bar
          dataKey="value"
          radius={chart.type === 'lollipop' ? [0, 8, 8, 0] : [8, 8, 0, 0]}
          onClick={(row) => {
            const payload = row as unknown as ChartPoint
            onPointClick(payload.recordIds ?? [], payload.label ?? '')
          }}
        >
          {points.map((entry) => (
            <Cell key={entry.key} fill={entry.color} />
          ))}
        </Bar>
      </ChartImpl>
    </ChartContainer>
  )
}
