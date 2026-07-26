'use client'

import * as React from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Database, Layers3, Loader2, RefreshCw, Rows3, ShieldCheck, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAdmin } from './admin-context'

interface Overview {
  table_count: number
  row_count: number
  product_counts: { slug: string; label: string; count: number; tables: number }[]
  table_counts: Record<string, number | null>
  recent_activity: { table: string; kind: string; id: string; title: string; status: string | null; timestamp: string | null }[]
}

const PRODUCT_COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500', 'bg-slate-500']

function relativeDate(value: string | null) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  const distance = Date.now() - date.getTime()
  const minutes = Math.floor(distance / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return date.toLocaleDateString()
}

export function AdminDashboard() {
  const { request, refreshCatalog } = useAdmin()
  const [data, setData] = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await request<Overview>('/api/admin/console/overview')
      setData(result)
      await refreshCatalog()
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load the admin dashboard')
    } finally {
      setLoading(false)
    }
  }, [refreshCatalog, request])

  React.useEffect(() => { void load() }, [load])

  if (loading && !data) return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600"><ShieldCheck className="size-3.5" />System overview</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Operations at a glance</h1><p className="mt-2 text-sm text-slate-500">A live, read-only view across every CPAAutomation product and database table.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="self-start bg-white sm:self-auto"><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />Refresh data</Button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {data && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Rows3} label="Total records" value={data.row_count.toLocaleString()} note="Across all registered tables" tone="blue" />
          <Metric icon={Database} label="Database tables" value={data.table_count.toLocaleString()} note="Available in the explorer" tone="violet" />
          <Metric icon={Users} label="User accounts" value={(data.table_counts.users ?? 0).toLocaleString()} note={`${(data.table_counts.firms ?? 0).toLocaleString()} firms`} tone="emerald" />
          <Metric icon={Activity} label="Usage events" value={(data.table_counts.usage_events ?? 0).toLocaleString()} note={`${(data.table_counts.automation_runs ?? 0).toLocaleString()} automation runs`} tone="amber" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Product data</h2><p className="mt-0.5 text-xs text-slate-400">Records grouped by operational area</p></div><Layers3 className="size-4 text-slate-400" /></div>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
              {data.product_counts.map((product, index) => <Link key={product.slug} href={`/admin/${product.slug}`} className="group border-b border-slate-100 p-5 transition-colors hover:bg-slate-50/80 sm:[&:nth-child(2n+1)]:border-l-0 xl:[&:nth-child(3n+1)]:border-l-0"><div className="flex items-start justify-between"><span className={cn('mt-1 size-2 rounded-full', PRODUCT_COLORS[index % PRODUCT_COLORS.length])} /><ArrowRight className="size-3.5 -translate-x-1 text-slate-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" /></div><p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{product.count.toLocaleString()}</p><p className="mt-1 text-sm font-medium text-slate-700">{product.label}</p><p className="mt-1 text-[11px] text-slate-400">{product.tables} database tables</p></Link>)}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Recent activity</h2><p className="mt-0.5 text-xs text-slate-400">Latest records across products</p></div><span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />Live</span></div>
            <div className="divide-y divide-slate-100">{data.recent_activity.length ? data.recent_activity.slice(0, 8).map((item, index) => <div key={`${item.table}-${item.id}-${index}`} className="flex gap-3 px-5 py-3.5"><div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100"><Activity className="size-3.5 text-slate-500" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-medium text-slate-800">{item.title}</p><span className="shrink-0 text-[10px] text-slate-400">{relativeDate(item.timestamp)}</span></div><p className="mt-1 truncate text-[11px] text-slate-400">{item.kind}{item.status ? ` · ${item.status.replace(/_/g, ' ')}` : ''}</p></div></div>) : <div className="px-5 py-16 text-center"><Activity className="mx-auto size-6 text-slate-300" /><p className="mt-2 text-xs text-slate-400">No recent operational records</p></div>}</div>
          </section>
        </div>

        <section className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50/60 p-5 sm:flex-row sm:items-center"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Database className="size-5" /></div><div className="flex-1"><p className="text-sm font-semibold text-slate-900">Need the raw record?</p><p className="mt-1 text-xs leading-5 text-slate-500">The database explorer includes all registered tables, paginated rows, schema details, and redacted CSV exports.</p></div><Button asChild size="sm" className="bg-slate-950 hover:bg-slate-800"><Link href="/admin/database">Open database explorer<ArrowRight className="size-3.5" /></Link></Button></section>
      </>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; note: string; tone: 'blue' | 'violet' | 'emerald' | 'amber' }) {
  const tones = { blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600' }
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]"><div className="flex items-center justify-between"><div className={cn('flex size-9 items-center justify-center rounded-lg', tones[tone])}><Icon className="size-4" /></div><span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Live</span></div><p className="mt-5 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{value}</p><p className="mt-1 text-sm font-medium text-slate-700">{label}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></div>
}
