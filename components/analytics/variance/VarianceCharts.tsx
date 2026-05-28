'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCurrency } from '@/lib/analytics/format'
import type { VarianceData } from '@/lib/analytics/varianceTypes'

interface VarianceChartsProps {
  rows: VarianceData[]
}

const chartConfig = {
  variance: { label: 'Variance ($)', color: 'hsl(var(--primary))' },
  favorable: { label: 'Favorable', color: 'hsl(var(--chart-2, 142 71% 45%))' },
  unfavorable: { label: 'Unfavorable', color: 'hsl(var(--destructive))' },
} satisfies ChartConfig

export function VarianceCharts({ rows }: VarianceChartsProps) {
  const topVariances = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.absVariance - a.absVariance)
      .slice(0, 10)
      .map((r) => ({
        name:
          r.accountName.length > 30 ? `${r.accountName.slice(0, 27)}…` : r.accountName,
        fullName: r.accountName,
        variance: r.variance,
        absVariance: r.absVariance,
        isFavorable: r.isFavorable,
      }))
  }, [rows])

  const scatterData = useMemo(() => {
    return rows
      .filter((r) => r.absVariancePercent !== 'N/M')
      .map((r) => ({
        name: r.accountName,
        absVariance: r.absVariance,
        absVariancePercent:
          typeof r.absVariancePercent === 'number' ? r.absVariancePercent : 0,
        isFlagged: r.isFlagged,
      }))
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-foreground-muted">
        No variance data to chart yet — run the analysis first.
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold text-foreground">Top variances by magnitude</div>
          <div className="text-xs text-foreground-muted">
            Largest absolute dollar movements (favorable in green, unfavorable in red).
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <BarChart
            data={topVariances}
            layout="vertical"
            margin={{ left: 12, right: 12, top: 12, bottom: 12 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(value) => formatCurrency(value as number)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatCurrency(value as number)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                />
              }
            />
            <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
              {topVariances.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.isFavorable === null
                      ? 'hsl(var(--primary))'
                      : entry.isFavorable
                        ? 'hsl(var(--chart-2, 142 71% 45%))'
                        : 'hsl(var(--destructive))'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold text-foreground">Risk matrix</div>
          <div className="text-xs text-foreground-muted">
            Absolute dollar variance vs. absolute percent variance. Flagged rows in red.
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <ScatterChart margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="absVariance"
              name="Abs $"
              tickFormatter={(value) => formatCurrency(value as number)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="absVariancePercent"
              name="Abs %"
              unit="%"
              tick={{ fontSize: 11 }}
            />
            <ZAxis range={[60, 140]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    if (name === 'absVariance') return formatCurrency(value as number)
                    if (name === 'absVariancePercent') return `${(value as number).toFixed(1)}%`
                    return value as string
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
              }
            />
            <Scatter data={scatterData}>
              {scatterData.map((entry, index) => (
                <Cell
                  key={`scatter-cell-${index}`}
                  fill={entry.isFlagged ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartContainer>
      </section>
    </div>
  )
}

export default VarianceCharts
