'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Download, Send } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useEsignReport } from '@/hooks/useEsignScale'
import { useEsignContext } from '@/hooks/useEnvelopes'
import { hasEsignAccess } from '@/lib/esign/access'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

function isoStart(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10) }
function dayStart(value: string) { return new Date(`${value}T00:00:00`).toISOString() }
function dayEnd(value: string) { return new Date(`${value}T23:59:59.999`).toISOString() }

export default function EsignReportsPage() {
  const [start, setStart] = React.useState(() => isoStart(29)); const [end, setEnd] = React.useState(() => isoStart(0)); const [source, setSource] = React.useState('all')
  const report = useEsignReport({ start: dayStart(start), end: dayEnd(end), source: source === 'all' ? undefined : source })
  const context = useEsignContext()
  const canExport = hasEsignAccess(context.data, { capability: 'exports' })
  const data = report.data
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-primary">Firm analytics</p><h1 className="text-2xl font-semibold">E‑Signature reports</h1><p className="mt-1 text-sm text-foreground-muted">Sent-cohort completion, active-envelope aging, and operational exceptions.</p></div>{canExport && <Button variant="outline" onClick={async () => { const blob = await apiClient.downloadEsignReportDetails(dayStart(start), dayEnd(end)); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = 'esign-report-details.csv'; link.click(); URL.revokeObjectURL(href) }}><Download className="mr-2 size-4" /> Export details</Button>}</div>
    <section className="flex flex-wrap gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm"><div><Label htmlFor="report-start">From</Label><Input id="report-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div><div><Label htmlFor="report-end">Through</Label><Input id="report-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div><div className="min-w-44"><Label>Source</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="bulk">Bulk</SelectItem><SelectItem value="powerform">PowerForm</SelectItem></SelectContent></Select></div></section>
    {report.isLoading ? <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton className="h-28" key={i} />)}</div> : data ? <>
      <div className="grid gap-4 md:grid-cols-4">{[
        [Send, 'Volume', data.volume.toLocaleString(), 'Envelopes sent in period'],
        [CheckCircle2, 'Completion', `${(data.completion_rate * 100).toFixed(1)}%`, `${data.completed} completed`],
        [Clock3, 'Median completion', data.median_completion_hours == null ? '—' : `${data.median_completion_hours.toFixed(1)}h`, data.p90_completion_hours == null ? 'No completions' : `p90 ${data.p90_completion_hours.toFixed(1)}h`],
        [AlertTriangle, 'Exceptions', Object.values(data.exceptions).reduce((sum, value) => sum + value, 0).toLocaleString(), 'Needs review'],
      ].map(([Icon, label, value, detail]) => <section key={String(label)} className="rounded-xl border border-border bg-surface p-5 shadow-sm"><Icon className="mb-4 size-5 text-primary" /><p className="text-sm text-foreground-muted">{String(label)}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{String(value)}</p><p className="mt-1 text-xs text-foreground-subtle">{String(detail)}</p></section>)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Active envelope aging</h2><div className="mt-5 space-y-3">{Object.entries(data.aging).map(([bucket, count]) => { const max = Math.max(1, ...Object.values(data.aging)); return <div key={bucket} className="grid grid-cols-[60px_1fr_40px] items-center gap-3 text-sm"><span>{bucket} days</span><div className="h-2 overflow-hidden rounded bg-surface-muted"><div className="h-full rounded bg-primary" style={{ width: `${count / max * 100}%` }} /></div><span className="text-right tabular-nums">{count}</span></div> })}</div></section>
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Exceptions</h2><dl className="mt-4 divide-y">{Object.entries(data.exceptions).map(([label, count]) => <div className="flex justify-between py-2.5 text-sm" key={label}><dt className="capitalize text-foreground-muted">{label.replace(/_/g, ' ')}</dt><dd className="font-medium tabular-nums">{count}</dd></div>)}</dl></section></div>
    </> : <p className="rounded-xl border p-8 text-center text-sm text-destructive">Could not load report data.</p>}
  </div>
}
