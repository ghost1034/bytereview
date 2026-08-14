'use client'

/** PSA reporting dashboards — WIP, realization, utilization, AR aging, trust. */
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useMemo } from 'react'
import {
  computeArAging,
  computeEffectiveRateByCurrency,
  computeRealizationByCurrency,
  computeUtilization,
  computeWipByCurrency,
  computeWipAging,
  trustBalancesByClient,
  utilizationByUser,
} from '../../../lib/psa/reporting'
import { formatMoney } from '../../../lib/billing/formatMoney'
import {
  useClientsStore,
  useExpensesStore,
  useInvoicesStore,
  useTimeEntriesStore,
  useTrustTransactionsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../../stores/entities'
import type { PsaReportFilters } from '../../../lib/psa/reporting'

type Props = { workspaceId: string }

const chartCfg = { value: { label: 'Amount', color: 'hsl(var(--chart-1))' } }

export function PsaReportsDashboard({ workspaceId }: Props) {
  const entries = useTimeEntriesStore((s) => s.list())
  const expenses = useExpensesStore((s) => s.list())
  const invoices = useInvoicesStore((s) => s.list())
  const clients = useClientsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const txs = useTrustTransactionsStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const filters: PsaReportFilters = useMemo(() => ({ workspaceId }), [workspaceId])
  const targetHours = workspace?.targetWeeklyHours ?? 40

  const wip = useMemo(() => computeWipByCurrency(entries, expenses, filters), [entries, expenses, filters])
  const realization = useMemo(() => computeRealizationByCurrency(entries, filters), [entries, filters])
  const utilization = useMemo(() => computeUtilization(entries, filters, targetHours), [entries, filters, targetHours])
  const effective = useMemo(() => computeEffectiveRateByCurrency(entries, filters), [entries, filters])
  const arData = useMemo(() => computeArAging(invoices, filters), [invoices, filters])
  const wipAging = useMemo(() => computeWipAging(entries, expenses, filters), [entries, expenses, filters])
  const utilByUser = useMemo(() => utilizationByUser(entries, users, filters, targetHours), [entries, users, filters, targetHours])
  const trustData = useMemo(() => trustBalancesByClient(clients, txs, filters), [clients, txs, filters])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="WIP" value={Object.entries(wip).map(([currency, value]) => formatMoney(value, currency)).join(' + ') || formatMoney(0, workspace?.defaultCurrency)} />
        <MetricCard label="Realization" value={Object.entries(realization).map(([currency, value]) => `${currency} ${(value * 100).toFixed(1)}%`).join(' · ') || '—'} />
        <MetricCard label="Utilization" value={`${utilization.toFixed(1)}%`} />
        <MetricCard label="Effective rate" value={Object.entries(effective).map(([currency, value]) => `${formatMoney(value, currency)}/hr`).join(' · ') || '—'} />
      </div>
      <ChartSection title="WIP aging" data={wipAging} />
      <ChartSection title="AR aging" data={arData} />
      <ChartSection title="Utilization by staff" data={utilByUser} />
      <ChartSection title="Trust balances" data={trustData} />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tl-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>{label}</p>
      <p className="font-sans text-2xl font-mono tabular-nums">{value}</p>
    </div>
  )
}

function ChartSection({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  return (
    <div className="tl-card p-4 shadow-sm">
      <h3 className="mb-3 font-medium">{title}</h3>
      <ChartContainer config={chartCfg} className="h-[220px] w-full">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
