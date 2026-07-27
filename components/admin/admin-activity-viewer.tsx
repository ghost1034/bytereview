'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Activity, CalendarClock, ChevronLeft, ChevronRight, ExternalLink,
  FilterX, Loader2, RefreshCw, Search, UserRound,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAdmin } from './admin-context'

interface ActivityUser {
  id: string | null
  email: string | null
  display_name: string | null
}

interface ActivityRow {
  id: string
  record_id: string
  table: string
  product: string
  product_label: string
  kind: string
  title: string
  action: string
  status: string | null
  timestamp: string | null
  user: ActivityUser | null
}

interface ActivityResponse {
  rows: ActivityRow[]
  page: number
  limit: number
  total: number
  pages: number
  generated_at: string
  source_counts: Record<string, number>
  product_counts: Record<string, number>
  filters: {
    users: ActivityUser[]
    products: { value: string; label: string }[]
    sources: { value: string; label: string; product: string }[]
    statuses: string[]
  }
}

type TimeRange = '24h' | '7d' | '30d' | 'all' | 'custom'

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]

const STATUS_STYLES: Record<string, string> = {
  succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  complete: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  enabled: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  running: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  'in progress': 'bg-blue-50 text-blue-700 ring-blue-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  draft: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  disabled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
}

function startForRange(range: TimeRange) {
  const duration = range === '24h' ? 86_400_000 : range === '7d' ? 7 * 86_400_000 : range === '30d' ? 30 * 86_400_000 : 0
  return duration ? new Date(Date.now() - duration).toISOString() : ''
}

function toIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function formatDateTime(value: string | null) {
  if (!value) return { date: 'No timestamp', time: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: value, time: '' }
  return {
    date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
  }
}

function humanize(value: string) {
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function userLabel(user: ActivityUser) {
  return user.display_name || user.email || user.id || 'Unknown user'
}

function initials(user: ActivityUser | null) {
  if (!user) return 'SY'
  const label = userLabel(user)
  const parts = label.split(/[\s@]+/).filter(Boolean)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || 'U'
}

export function AdminActivityViewer() {
  const { request } = useAdmin()
  const [data, setData] = React.useState<ActivityResponse | null>(null)
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const deferredSearch = React.useDeferredValue(search)
  const [userId, setUserId] = React.useState('')
  const [product, setProduct] = React.useState('')
  const [sourceTable, setSourceTable] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [timeRange, setTimeRange] = React.useState<TimeRange>('30d')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [refreshKey, setRefreshKey] = React.useState(0)

  const timeBounds = React.useMemo(() => ({
    from: timeRange === 'custom' ? toIso(customFrom) : startForRange(timeRange),
    to: timeRange === 'custom' ? toIso(customTo) : '',
  }), [customFrom, customTo, timeRange])

  React.useEffect(() => setPage(1), [deferredSearch, userId, product, sourceTable, status, timeBounds.from, timeBounds.to])

  React.useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim())
    if (userId) params.set('user_id', userId)
    if (product) params.set('product', product)
    if (sourceTable) params.set('source_table', sourceTable)
    if (status) params.set('status', status)
    if (timeBounds.from) params.set('from', timeBounds.from)
    if (timeBounds.to) params.set('to', timeBounds.to)

    setLoading(true)
    setError('')
    request<ActivityResponse>(`/api/admin/console/activity?${params.toString()}`)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((fetchError) => { if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Could not load activity') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [deferredSearch, page, product, refreshKey, request, sourceTable, status, timeBounds.from, timeBounds.to, userId])

  const resetFilters = () => {
    setSearch('')
    setUserId('')
    setProduct('')
    setSourceTable('')
    setStatus('')
    setTimeRange('30d')
    setCustomFrom('')
    setCustomTo('')
  }

  const filteredSources = data?.filters.sources.filter((source) => !product || source.product === product) ?? []
  const activeFilterCount = [search, userId, product, sourceTable, status, timeRange !== '30d' ? timeRange : ''].filter(Boolean).length
  const visibleProductCount = data ? Object.values(data.product_counts).filter((count) => count > 0).length : 0

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600"><Activity className="size-3.5" />Operational oversight</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Activity viewer</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Trace activity across CPAAutomation by actor, time, product, source, and status. Sensitive record contents remain excluded.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="self-start bg-white sm:self-auto">
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />Refresh activity
        </Button>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-slate-500">Time range</span>
            {RANGE_OPTIONS.map((option) => (
              <button key={option.value} onClick={() => setTimeRange(option.value)} className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', timeRange === option.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                {option.label}
              </button>
            ))}
            <button onClick={() => setTimeRange('custom')} className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', timeRange === 'custom' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>Custom</button>
          </div>
          {timeRange === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
              <label className="text-xs font-medium text-slate-600">From<Input type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 h-9 text-xs" /></label>
              <label className="text-xs font-medium text-slate-600">To<Input type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 h-9 text-xs" /></label>
            </div>
          )}
        </div>

        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))_auto]">
          <label className="relative block">
            <span className="sr-only">Search activity</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity or user…" className="h-10 pl-9 text-xs" />
          </label>
          <FilterSelect label="User" value={userId} onChange={setUserId}>
            <option value="">All users</option><option value="system">System / device</option>
            {data?.filters.users.map((user) => <option key={user.id ?? user.email ?? ''} value={user.id ?? ''}>{userLabel(user)}{user.display_name && user.email ? ` · ${user.email}` : ''}</option>)}
          </FilterSelect>
          <FilterSelect label="Product" value={product} onChange={(value) => { setProduct(value); setSourceTable('') }}>
            <option value="">All products</option>{data?.filters.products.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Source" value={sourceTable} onChange={setSourceTable}>
            <option value="">All activity types</option>{filteredSources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">Any status</option>{data?.filters.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </FilterSelect>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!activeFilterCount} className="h-10 justify-center text-xs text-slate-500"><FilterX className="size-3.5" />Reset</Button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Matching activity" value={data?.total.toLocaleString() ?? '—'} note="Across the selected filters" />
        <SummaryCard label="Products represented" value={visibleProductCount.toLocaleString()} note="Operational areas with matches" />
        <SummaryCard label="Rows on this page" value={(data?.rows.length ?? 0).toLocaleString()} note={data ? `Updated ${new Date(data.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading latest activity'} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-sm font-semibold text-slate-900">Activity stream</h2><p className="mt-0.5 text-xs text-slate-400">Newest matching activity first</p></div>
          {activeFilterCount > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}</span>}
        </div>

        {loading && !data ? (
          <div className="flex h-80 items-center justify-center"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
        ) : data?.rows.length ? (
          <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-55')}>
            <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50/70"><th className="px-5 py-3 font-medium text-slate-500">Time</th><th className="px-4 py-3 font-medium text-slate-500">User</th><th className="px-4 py-3 font-medium text-slate-500">Activity</th><th className="px-4 py-3 font-medium text-slate-500">Product</th><th className="px-4 py-3 font-medium text-slate-500">Status</th><th className="px-4 py-3 font-medium text-slate-500">Source</th><th className="px-5 py-3 text-right font-medium text-slate-500">Data</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => <ActivityTableRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-80 flex-col items-center justify-center px-6 text-center"><CalendarClock className="size-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No activity matches these filters</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">Try a wider time range, another user, or clear the source and status filters.</p><Button variant="outline" size="sm" className="mt-4 text-xs" onClick={resetFilters}>Clear filters</Button></div>
        )}

        {data && data.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Showing {((data.page - 1) * data.limit + 1).toLocaleString()}–{Math.min(data.page * data.limit, data.total).toLocaleString()} of {data.total.toLocaleString()}</p>
            <div className="flex items-center gap-2"><span className="mr-1 tabular-nums">Page {data.page} of {data.pages}</span><Button variant="outline" size="icon" className="size-8" disabled={data.page <= 1 || loading} onClick={() => setPage((value) => value - 1)} aria-label="Previous activity page"><ChevronLeft className="size-3.5" /></Button><Button variant="outline" size="icon" className="size-8" disabled={data.page >= data.pages || loading} onClick={() => setPage((value) => value + 1)} aria-label="Next activity page"><ChevronRight className="size-3.5" /></Button></div>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="relative block"><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-xs text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">{children}</select><ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-slate-400" /></label>
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-slate-900/[0.03]"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></div>
}

function ActivityTableRow({ row }: { row: ActivityRow }) {
  const when = formatDateTime(row.timestamp)
  const label = row.user ? userLabel(row.user) : 'System / device'
  const statusStyle = row.status ? STATUS_STYLES[row.status.toLowerCase()] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20' : ''
  return (
    <tr className="align-top hover:bg-blue-50/30">
      <td className="whitespace-nowrap px-5 py-4"><p className="font-medium text-slate-700">{when.date}</p><p className="mt-1 text-[11px] tabular-nums text-slate-400">{when.time}</p></td>
      <td className="max-w-[230px] px-4 py-4"><div className="flex items-start gap-2.5"><span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold', row.user ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500')}>{row.user ? initials(row.user) : <UserRound className="size-3.5" />}</span><div className="min-w-0"><p className="truncate font-medium text-slate-700" title={label}>{label}</p>{row.user?.display_name && row.user.email && <p className="mt-0.5 truncate text-[10px] text-slate-400" title={row.user.email}>{row.user.email}</p>}</div></div></td>
      <td className="max-w-[350px] px-4 py-4"><p className="truncate font-medium text-slate-800" title={row.title}>{row.title}</p><p className="mt-1 truncate text-[11px] text-slate-400">{humanize(row.action)} · {row.kind}</p></td>
      <td className="whitespace-nowrap px-4 py-4"><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">{row.product_label}</span></td>
      <td className="whitespace-nowrap px-4 py-4">{row.status ? <span className={cn('rounded-full px-2 py-1 text-[10px] font-medium capitalize ring-1 ring-inset', statusStyle)}>{humanize(row.status)}</span> : <span className="text-slate-300">—</span>}</td>
      <td className="max-w-[190px] px-4 py-4"><code className="block truncate text-[10px] text-slate-500" title={row.table}>{row.table}</code><p className="mt-1 max-w-[150px] truncate font-mono text-[9px] text-slate-300" title={row.record_id}>{row.record_id}</p></td>
      <td className="px-5 py-4 text-right"><Link href={`/admin/${row.product}`} className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-blue-600 hover:text-blue-800">Open data<ExternalLink className="size-3" /></Link></td>
    </tr>
  )
}
