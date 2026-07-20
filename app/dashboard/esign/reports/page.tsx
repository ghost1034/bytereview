'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock3, Download, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiClient, type EsignReportFilters } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useEsignReport, useEsignReportTimeSeries } from '@/hooks/useEsignScale'
import { useEsignContext, useEsignTemplates } from '@/hooks/useEnvelopes'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'
import { hasEsignAccess } from '@/lib/esign/access'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

function isoStart(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10) }
function dayStart(value: string) { return new Date(`${value}T00:00:00`).toISOString() }
function dayEnd(value: string) { return new Date(`${value}T23:59:59.999`).toISOString() }
function saveBlob(blob: Blob, filename: string) { const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = filename; link.click(); URL.revokeObjectURL(href) }

export default function EsignReportsPage() {
  const [start, setStart] = React.useState(() => isoStart(29)); const [end, setEnd] = React.useState(() => isoStart(0))
  const [source, setSource] = React.useState('all'); const [status, setStatus] = React.useState('all'); const [templateVersionId, setTemplateVersionId] = React.useState('all'); const [senderId, setSenderId] = React.useState('all'); const [sourceId, setSourceId] = React.useState('')
  const context = useEsignContext(); const templates = useEsignTemplates(); const firm = useAnalyticsFirm()
  const canFirmView = !!context.data && (context.data.profile.admin_override || context.data.administrative_capabilities.view_firm_envelopes)
  const canExport = hasEsignAccess(context.data, { capability: 'exports' })
  const versions = useQuery({ queryKey: ['esign', 'report', 'template-versions'], enabled: !!templates.data,
    queryFn: async () => (await Promise.all((templates.data?.templates ?? []).map(async template => (await apiClient.listEsignTemplateVersions(template.id)).versions.map(version => ({ ...version, templateName: template.name }))))).flat() })
  const filters: EsignReportFilters = { start: dayStart(start), end: dayEnd(end), source: source === 'all' ? undefined : source, status: status === 'all' ? undefined : status, templateVersionId: templateVersionId === 'all' ? undefined : templateVersionId, senderUserId: canFirmView && senderId !== 'all' ? senderId : undefined, sourceId: sourceId.trim() || undefined }
  const report = useEsignReport(filters); const series = useEsignReportTimeSeries(filters); const data = report.data
  const drilldown = (nextStatus?: string) => { const query = new URLSearchParams(); if (nextStatus) query.set('view', nextStatus); if (source !== 'all') query.set('source', source); return `/dashboard/esign?${query}` }
  const cards: Array<[LucideIcon, string, string, string, string?]> = data ? [
    [Send, 'Volume', data.volume.toLocaleString(), 'Envelopes sent in period'],
    [CheckCircle2, 'Completion', `${(data.completion_rate * 100).toFixed(1)}%`, `${data.completed} completed`, 'completed'],
    [Clock3, 'Median completion', data.median_completion_hours == null ? '—' : `${data.median_completion_hours.toFixed(1)}h`, data.p90_completion_hours == null ? 'No completions' : `p90 ${data.p90_completion_hours.toFixed(1)}h`],
    [AlertTriangle, 'Exceptions', Object.values(data.exceptions).reduce((sum, value) => sum + value, 0).toLocaleString(), 'Needs review', 'send_failed'],
  ] : []

  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-primary">Firm analytics</p><h1 className="text-2xl font-semibold">E‑Signature reports</h1><p className="mt-1 text-sm text-foreground-muted">Sent-cohort completion, trends, aging, and operational drilldowns.</p></div>{canExport && <Button variant="outline" onClick={async () => saveBlob(await apiClient.downloadEsignReportDetails(filters), 'esign-report-details.csv')}><Download className="mr-2 size-4" /> Export filtered details</Button>}</div>
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="report-start">From</Label><Input id="report-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div><div><Label htmlFor="report-end">Through</Label><Input id="report-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div><div><Label>Source</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="bulk">Bulk</SelectItem><SelectItem value="powerform">PowerForm</SelectItem></SelectContent></Select></div><div><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{['scheduled', 'send_failed', 'sent', 'in_progress', 'completed', 'declined', 'voided', 'expired'].map(item => <SelectItem key={item} value={item}>{item.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2"><Label>Published template version</Label><Select value={templateVersionId} onValueChange={setTemplateVersionId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All template versions</SelectItem>{versions.data?.map(version => <SelectItem key={version.id} value={version.id}>{version.templateName} · v{version.version}</SelectItem>)}</SelectContent></Select></div>{canFirmView && <div><Label>Sender</Label><Select value={senderId} onValueChange={setSenderId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All senders</SelectItem>{firm.data?.members?.map(member => <SelectItem key={member.user_id} value={member.user_id}>{member.display_name || member.email}</SelectItem>)}</SelectContent></Select></div>}<div><Label>Bulk job / PowerForm ID</Label><Input value={sourceId} onChange={e => setSourceId(e.target.value)} placeholder="Optional source ID" /></div></section>
    {report.isLoading ? <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton className="h-28" key={i} />)}</div> : data ? <>
      <div className="grid gap-4 md:grid-cols-4">{cards.map(([Icon, label, value, detail, target]) => <Link href={drilldown(target)} key={label} className="rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary/40"><Icon className="mb-4 size-5 text-primary" /><p className="text-sm text-foreground-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-foreground-subtle">{detail} · View envelopes</p></Link>)}</div>
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Sent and completed over time</h2><div className="mt-4 h-72">{series.data?.points.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={series.data.points}><CartesianGrid strokeDasharray="3 3" opacity={0.25} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="sent" stroke="var(--primary)" strokeWidth={2} /><Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-foreground-muted">No sent envelopes match these filters.</p>}</div></section>
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Active envelope aging</h2><div className="mt-5 space-y-3">{Object.entries(data.aging).map(([bucket, count]) => { const max = Math.max(1, ...Object.values(data.aging)); return <Link href={drilldown('active')} key={bucket} className="grid grid-cols-[60px_1fr_40px] items-center gap-3 text-sm hover:text-primary"><span>{bucket} days</span><div className="h-2 overflow-hidden rounded bg-surface-muted"><div className="h-full rounded bg-primary" style={{ width: `${count / max * 100}%` }} /></div><span className="text-right tabular-nums">{count}</span></Link> })}</div></section><section className="rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Exceptions</h2><dl className="mt-4 divide-y">{Object.entries(data.exceptions).map(([label, count]) => <Link href={drilldown(['declined', 'expired', 'send_failed'].includes(label) ? label : undefined)} className="flex justify-between py-2.5 text-sm hover:text-primary" key={label}><dt className="capitalize text-foreground-muted">{label.replace(/_/g, ' ')}</dt><dd className="font-medium tabular-nums">{count}</dd></Link>)}</dl></section></div>
    </> : <p className="rounded-xl border p-8 text-center text-sm text-destructive">Could not load report data.</p>}
  </div>
}
