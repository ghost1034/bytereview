'use client'

/** Minimal chart primitives for portfolio dashboard (step 26 extends). */
import { Cell, Pie, PieChart, Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatProjectStatus, getProjectStatusColor } from './portfolioHealth'

type DonutProps = {
  data: { name: string; value: number; statusKey?: string }[]
}

export function PortfolioDonutChart({ data }: DonutProps) {
  const config = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: d.statusKey ? getProjectStatusColor(d.statusKey as never) : 'var(--primary)' }])
  )
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[200px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.statusKey ? getProjectStatusColor(entry.statusKey as never) : 'var(--primary)'} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

type BarProps = {
  data: { label: string; value: number }[]
}

export function PortfolioBarChart({ data }: BarProps) {
  const config = { value: { label: 'Projects', color: 'var(--primary)' } }
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

type LineProps = {
  data: { date: string; count: number }[]
}

export function PortfolioLineChart({ data }: LineProps) {
  const config = { count: { label: 'Tasks completed', color: 'var(--accent)' } }
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} />
        <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}

type NumberProps = { label: string; value: number | string; suffix?: string }

export function PortfolioNumberCard({ label, value, suffix }: NumberProps) {
  return (
    <div className="tl-card flex flex-col items-center justify-center p-6 text-center shadow-paper-sm">
      <p className="text-3xl font-serif tabular-nums" style={{ color: 'var(--primary)' }}>
        {value}{suffix}
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>{label}</p>
    </div>
  )
}

/** Build donut slices from status counts. */
export function statusCountsToDonut(statusCounts: Record<string, number>) {
  return Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: formatProjectStatus(key === 'unset' ? null : key as never),
      value,
      statusKey: key === 'unset' ? undefined : key,
    }))
}
