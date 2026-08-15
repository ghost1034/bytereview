'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Archive, ArrowLeft, BellOff, BellRing, Bot, CalendarDays, Check,
  ChevronDown, ChevronRight, Download, File, FileSpreadsheet, MessageSquare, Pencil,
  Plus, Send, Upload, X,
} from 'lucide-react'

import { usePbcEngagement, useInvalidatePbc } from '@/hooks/usePbc'
import { pbcApi } from '@/lib/pbc/api'
import type { PbcRequestItem } from '@/lib/pbc/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PbcClientAccess } from '@/components/pbc/PbcClientAccess'

const statusStyle: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', open: 'bg-blue-50 text-blue-700', submitted: 'bg-amber-50 text-amber-700',
  needs_changes: 'bg-rose-50 text-rose-700', accepted: 'bg-emerald-50 text-emerald-700', waived: 'bg-slate-100 text-slate-500',
}

const engagementStatusStyle: Record<string, string> = {
  draft: 'bg-surface-muted text-foreground-muted',
  active: 'bg-primary-soft text-primary',
  completed: 'bg-success-soft text-success',
  archived: 'bg-surface-muted text-foreground-subtle',
}

const formatStatus = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
const formatBytes = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`

type CompletenessFlag = { request_id: string; request_number: string; warnings: string[] }
type EngagementDateForm = { period_start: string; period_end: string; due_date: string }

type RequestFormValues = {
  request_number: string
  position: string
  category: string
  title: string
  description: string
  period_end: string
  priority: PbcRequestItem['priority']
  due_date: string
  owner_user_id: string
  expected_filename: string
  expected_formats: string
  gl_account: string
  gl_balance: string
  sensitive: boolean
  requires_redaction: boolean
  dependency_ids: string[]
  external_source_id: string
}

const emptyRequestForm = (requestCount: number, ownerUserId?: string | null): RequestFormValues => ({
  request_number: '', position: String(requestCount + 1), category: 'Other', title: '', description: '',
  period_end: '', priority: 'normal', due_date: '', owner_user_id: ownerUserId || '', expected_filename: '',
  expected_formats: '', gl_account: '', gl_balance: '', sensitive: false, requires_redaction: false,
  dependency_ids: [], external_source_id: '',
})

const requestFormFrom = (request: PbcRequestItem): RequestFormValues => ({
  request_number: request.request_number, position: String(request.sort_order + 1), category: request.category || '',
  title: request.title, description: request.description || '', period_end: request.period_end || '',
  priority: request.priority, due_date: request.due_date || '', owner_user_id: request.owner_user_id || '',
  expected_filename: request.expected_filename || '', expected_formats: request.expected_formats.join(', '),
  gl_account: request.gl_account || '', gl_balance: request.gl_balance || '', sensitive: request.sensitive,
  requires_redaction: request.requires_redaction, dependency_ids: request.dependency_ids || [],
  external_source_id: request.external_source_id || '',
})

export function PbcEngagementWorkspace({ engagementId }: { engagementId: string }) {
  const engagement = usePbcEngagement(engagementId)
  const invalidate = useInvalidatePbc()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [editingRequest, setEditingRequest] = React.useState<PbcRequestItem | 'new' | null>(null)
  const [requestForm, setRequestForm] = React.useState<RequestFormValues>(() => emptyRequestForm(0))
  const [aiOpen, setAiOpen] = React.useState(false)
  const [datesOpen, setDatesOpen] = React.useState(false)
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [dateForm, setDateForm] = React.useState<EngagementDateForm>({ period_start: '', period_end: '', due_date: '' })
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [comment, setComment] = React.useState('')
  const [commentVisibility, setCommentVisibility] = React.useState<'client' | 'internal'>('client')
  const [ai, setAi] = React.useState<{ summary: string; proposals: Array<Record<string, unknown>> } | null>(null)
  const [flags, setFlags] = React.useState<CompletenessFlag[] | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const importRef = React.useRef<HTMLInputElement>(null)

  const data = engagement.data
  const requests = React.useMemo(() => data?.requests || [], [data?.requests])
  const selected = requests.find((item) => item.id === selectedId) || null

  React.useEffect(() => {
    if ((!selectedId || !requests.some((item) => item.id === selectedId)) && requests[0]) setSelectedId(requests[0].id)
    if (requests.length === 0) setSelectedId(null)
  }, [requests, selectedId])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await action(); await invalidate(); await engagement.refetch() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(null) }
  }

  const openNewRequest = () => {
    setRequestForm(emptyRequestForm(requests.length, data?.owner_user_id))
    setEditingRequest('new')
  }

  const openEditRequest = (request: PbcRequestItem) => {
    setRequestForm(requestFormFrom(request))
    setEditingRequest(request)
  }

  const saveRequest = async (event: React.FormEvent) => {
    event.preventDefault()
    const formats = Array.from(new Set(requestForm.expected_formats.split(/[,;]+/).map((value) => value.trim().toLowerCase().replace(/^\./, '')).filter(Boolean)))
    const payload = {
      ...(requestForm.request_number.trim() ? { request_number: requestForm.request_number.trim() } : {}),
      sort_order: Math.max(0, Number(requestForm.position || 1) - 1),
      category: requestForm.category.trim() || null,
      title: requestForm.title.trim(),
      description: requestForm.description.trim() || null,
      period_end: requestForm.period_end || null,
      priority: requestForm.priority,
      due_date: requestForm.due_date || data?.due_date || null,
      owner_user_id: requestForm.owner_user_id || null,
      expected_filename: requestForm.expected_filename.trim() || null,
      expected_formats: formats,
      gl_account: requestForm.gl_account.trim() || null,
      gl_balance: requestForm.gl_balance.trim() || null,
      sensitive: requestForm.sensitive,
      requires_redaction: requestForm.requires_redaction,
      dependency_ids: requestForm.dependency_ids,
      external_source_id: requestForm.external_source_id.trim() || null,
    }
    await run(editingRequest === 'new' ? 'create' : 'edit', async () => {
      const result = editingRequest === 'new'
        ? await pbcApi.createRequest(engagementId, payload)
        : await pbcApi.updateRequest(editingRequest!.id, { ...payload, expected_revision: editingRequest!.revision })
      setEditingRequest(null)
      setSelectedId(result.id)
    })
  }

  const uploadFile = async (file?: File) => {
    if (!file || !selected) return
    await run('upload', () => pbcApi.upload(selected.id, file))
    if (fileRef.current) fileRef.current.value = ''
  }

  const importList = async (file?: File) => {
    if (!file) return
    await run('import', async () => {
      const preview = await pbcApi.importPreview(file)
      if (!window.confirm(`Import ${preview.row_count} validated request${preview.row_count === 1 ? '' : 's'} into this draft engagement?`)) return
      await pbcApi.importCommit(engagementId, preview.rows)
    })
    if (importRef.current) importRef.current.value = ''
  }

  const loadAi = async () => {
    setAiOpen(true); setBusy('ai'); setError(null)
    try { setAi(await pbcApi.aiDraft(engagementId)) }
    catch (err) { setError(err instanceof Error ? err.message : 'AI drafting failed') }
    finally { setBusy(null) }
  }

  const applyAi = async () => {
    if (!ai) return
    await run('ai-apply', async () => {
      for (const proposal of ai.proposals) {
        await pbcApi.createRequest(engagementId, {
          title: proposal.title, category: proposal.category, description: proposal.description,
          priority: proposal.priority, expected_formats: proposal.expected_formats,
          due_date: data?.due_date || null,
        })
      }
      setAiOpen(false); setAi(null)
    })
  }

  const checkCompleteness = async () => {
    setFlags(null)
    await run('flags', async () => { setFlags((await pbcApi.completeness(engagementId)).flags) })
  }

  const openDates = () => {
    if (!data) return
    setDateForm({
      period_start: data.period_start || '',
      period_end: data.period_end || '',
      due_date: data.due_date || '',
    })
    setDatesOpen(true)
  }

  const saveDates = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!data) return
    if (dateForm.period_start && dateForm.period_end && dateForm.period_start > dateForm.period_end) {
      setError('Period start must be on or before period end')
      return
    }
    await run('dates', async () => {
      await pbcApi.updateEngagement(engagementId, {
        period_start: dateForm.period_start || null,
        period_end: dateForm.period_end || null,
        due_date: dateForm.due_date || null,
        expected_revision: data.revision,
      })
      setDatesOpen(false)
    })
  }

  const toggleReminders = () => {
    if (!data) return Promise.resolve()
    return pbcApi.updateEngagement(engagementId, {
      reminders_paused: !data.reminders_paused,
      expected_revision: data.revision,
    })
  }

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !comment.trim()) return
    await run('comment', async () => { await pbcApi.comment(selected.id, comment.trim(), commentVisibility); setComment('') })
  }

  if (engagement.isLoading) return <div className="flex min-h-[420px] items-center justify-center text-sm text-foreground-muted">Loading PBC engagement…</div>
  if (!data) return <div className="rounded-xl border p-8 text-center text-sm text-destructive">{engagement.error?.message || 'Engagement not found'}</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Link href="/dashboard/pbc" className="mb-3 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"><ArrowLeft className="size-4" />PBC workspace</Link>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1><Badge className={engagementStatusStyle[data.status]}>{formatStatus(data.status)}</Badge></div>
          <p className="mt-1 text-sm text-foreground-muted">{data.client_name}{data.period_end ? ` · Period ended ${data.period_end}` : ''}{data.due_date ? ` · Due ${data.due_date}` : ''}</p>
          <div className="mt-3 flex max-w-md items-center gap-3"><Progress value={data.progress} className="h-2" /><span className="text-sm font-medium tabular-nums">{data.progress}%</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={checkCompleteness} disabled={!!busy}><AlertTriangle className="mr-2 size-4" />{busy === 'flags' ? 'Checking…' : 'Check completeness'}</Button>
          <Button variant="outline" onClick={loadAi} disabled={!!busy || data.status !== 'draft'}><Bot className="mr-2 size-4" />Draft with AI</Button>
          <Button variant="outline" onClick={() => run('export', () => pbcApi.downloadArtifact(engagementId, 'export.xlsx', `${data.name}-pbc.xlsx`))}><Download className="mr-2 size-4" />Tracker</Button>
          <Button variant="outline" onClick={() => run('package', () => pbcApi.downloadArtifact(engagementId, 'package.zip', `${data.name}-evidence-package.zip`))}><Download className="mr-2 size-4" />Package</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" disabled={!!busy}><span>Manage</span><ChevronDown className="ml-2 size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={openDates} disabled={data.status === 'archived'}><CalendarDays className="size-4" />Edit engagement dates</DropdownMenuItem>
              {data.status === 'active' && <DropdownMenuItem onSelect={() => void run('reminders', toggleReminders)}>{data.reminders_paused ? <BellRing className="size-4" /> : <BellOff className="size-4" />}{data.reminders_paused ? 'Resume reminders' : 'Pause reminders'}</DropdownMenuItem>}
              {(data.status === 'draft' || data.status === 'completed') && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setArchiveOpen(true)}><Archive className="size-4" />Archive engagement</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
          {data.status === 'draft' && <Button onClick={() => run('publish', () => pbcApi.publish(engagementId))} disabled={!!busy}><Send className="mr-2 size-4" />Publish</Button>}
          {data.status === 'active' && <Button onClick={() => run('complete-engagement', () => pbcApi.engagementAction(engagementId, 'complete'))} disabled={!!busy}><Check className="mr-2 size-4" />Complete</Button>}
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span><button className="ml-auto" onClick={() => setError(null)} aria-label="Dismiss"><X className="size-4" /></button></div>}
      {data.reminders_paused && data.status === 'active' && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm"><BellOff className="size-4 shrink-0 text-warning" /><span className="flex-1"><strong>Automated reminders are paused.</strong> Clients will not receive scheduled reminder emails for this engagement.</span><Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('reminders', toggleReminders)}>{busy === 'reminders' ? 'Resuming…' : 'Resume reminders'}</Button></div>}
      {flags && flags.length === 0 && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Check className="mt-0.5 size-4 shrink-0" /><span><strong>Completeness check passed.</strong> No items currently require attention.</span></div>}
      {flags && flags.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Completeness review found {flags.length} item{flags.length === 1 ? '' : 's'} requiring attention.</p><ul className="mt-2 list-disc space-y-1 pl-5">{flags.slice(0, 5).map((flag) => <li key={flag.request_id}><button className="underline" onClick={() => setSelectedId(flag.request_id)}>{flag.request_number}</button>: {flag.warnings.join('; ')}</li>)}</ul></div>}

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card shadow-sm xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0 border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div><h2 className="font-semibold">Request list</h2><p className="text-xs text-foreground-muted">{requests.length} request{requests.length === 1 ? '' : 's'}</p></div>
            <div className="flex gap-2">
              <input ref={importRef} className="hidden" type="file" accept=".xlsx,.csv" onChange={(e) => importList(e.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={data.status !== 'draft' || !!busy} onClick={() => importRef.current?.click()}><FileSpreadsheet className="mr-2 size-4" />Import</Button>
              <Button size="sm" disabled={data.status === 'completed' || data.status === 'archived'} onClick={openNewRequest}><Plus className="mr-2 size-4" />Request</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] divide-y">
              <div className="grid grid-cols-[90px_minmax(260px,1fr)_120px_120px_110px_24px] gap-3 bg-surface-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted"><span>Number</span><span>Request</span><span>Due</span><span>Status</span><span>Files</span><span /></div>
              {requests.length === 0 && <div className="p-12 text-center"><File className="mx-auto size-8 text-foreground-muted" /><p className="mt-3 font-medium">Build the request list</p><p className="mt-1 text-sm text-foreground-muted">Add requests, import a spreadsheet, or ask AI for a proposal.</p></div>}
              {requests.map((item) => (
                <button key={item.id} onClick={() => setSelectedId(item.id)} className={cn('grid w-full grid-cols-[90px_minmax(260px,1fr)_120px_120px_110px_24px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-muted/50', selectedId === item.id && 'bg-primary/5')}>
                  <span className="font-mono text-xs text-foreground-muted">{item.request_number}</span>
                  <span className="min-w-0"><span className="block truncate font-medium">{item.title}</span><span className="block truncate text-xs text-foreground-muted">{item.category || 'Uncategorized'} · {item.owner_name || 'Unassigned'}</span></span>
                  <span className={cn('tabular-nums', item.due_date && new Date(`${item.due_date}T23:59:00`) < new Date() && !['accepted', 'waived'].includes(item.status) && 'text-destructive')}>{item.due_date || '—'}</span>
                  <Badge className={cn('w-fit', statusStyle[item.status])}>{formatStatus(item.status)}</Badge>
                  <span>{item.documents.filter((document) => document.state === 'available').length} version{item.documents.length === 1 ? '' : 's'}</span>
                  <ChevronRight className="size-4 text-foreground-muted" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="min-w-0 bg-surface/50">
          {!selected && <div className="flex h-full min-h-[400px] items-center justify-center p-8 text-center text-sm text-foreground-muted">Select a request to review its evidence and conversation.</div>}
          {selected && <RequestDetail request={selected} requests={requests} busy={busy} onRun={run} onEdit={() => openEditRequest(selected)} onUpload={() => fileRef.current?.click()} onComment={addComment} comment={comment} setComment={setComment} visibility={commentVisibility} setVisibility={setCommentVisibility} />}
          <input ref={fileRef} className="hidden" type="file" onChange={(e) => uploadFile(e.target.files?.[0])} />
        </aside>
      </div>

      <PbcClientAccess engagement={data} requests={requests} busy={busy} onRun={run} />

      <RequestEditorDialog
        open={editingRequest !== null}
        editing={editingRequest !== 'new'}
        form={requestForm}
        setForm={setRequestForm}
        requests={requests}
        currentRequestId={editingRequest === 'new' ? null : editingRequest?.id || null}
        members={data.firm_members || []}
        busy={busy}
        onOpenChange={(open) => { if (!open) setEditingRequest(null) }}
        onSubmit={saveRequest}
      />
      <Dialog open={datesOpen} onOpenChange={setDatesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit engagement dates</DialogTitle><DialogDescription>Update the reporting period and the default due date used for new requests. Existing request due dates are unchanged.</DialogDescription></DialogHeader>
          <form className="space-y-5" onSubmit={saveDates}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="engagement-period-start">Period start</Label><Input id="engagement-period-start" type="date" max={dateForm.period_end || undefined} value={dateForm.period_start} onChange={(event) => setDateForm((current) => ({ ...current, period_start: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="engagement-period-end">Period end</Label><Input id="engagement-period-end" type="date" min={dateForm.period_start || undefined} value={dateForm.period_end} onChange={(event) => setDateForm((current) => ({ ...current, period_end: event.target.value }))} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="engagement-due-date">Default due date</Label><Input id="engagement-due-date" type="date" value={dateForm.due_date} onChange={(event) => setDateForm((current) => ({ ...current, due_date: event.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDatesOpen(false)}>Cancel</Button><Button disabled={busy === 'dates'}>{busy === 'dates' ? 'Saving…' : 'Save dates'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive this engagement?</AlertDialogTitle><AlertDialogDescription>{data.status === 'draft' ? 'The draft request list will be locked and retained in the engagement history.' : 'The completed request list, evidence, and audit history will be retained but the engagement will be locked.'}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy === 'archive'} onClick={() => void run('archive', async () => { await pbcApi.engagementAction(engagementId, 'archive'); setArchiveOpen(false) })}>{busy === 'archive' ? 'Archiving…' : 'Archive engagement'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={aiOpen} onOpenChange={setAiOpen}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>AI request-list proposal</DialogTitle><DialogDescription>Review every suggestion before adding it. AI cannot publish or contact the client.</DialogDescription></DialogHeader>{busy === 'ai' && <p className="py-12 text-center text-sm text-foreground-muted">Drafting a request list from engagement metadata and firm templates…</p>}{ai && <div className="space-y-4"><p className="rounded-lg bg-surface-muted p-3 text-sm">{ai.summary}</p><div className="divide-y rounded-lg border">{ai.proposals.map((proposal, index) => <div key={index} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{String(proposal.title)}</p><p className="mt-1 text-sm text-foreground-muted">{String(proposal.description || '')}</p></div><Badge variant="outline">{String(proposal.category || 'Other')}</Badge></div><p className="mt-2 text-xs text-foreground-muted">Why suggested: {String(proposal.rationale || 'Engagement context')}</p></div>)}</div><Button className="w-full" onClick={applyAi} disabled={busy === 'ai-apply'}>{busy === 'ai-apply' ? 'Adding requests…' : `Confirm and add ${ai.proposals.length} requests`}</Button></div>}</DialogContent></Dialog>
    </div>
  )
}

function RequestEditorDialog({ open, editing, form, setForm, requests, currentRequestId, members, busy, onOpenChange, onSubmit }: {
  open: boolean
  editing: boolean
  form: RequestFormValues
  setForm: React.Dispatch<React.SetStateAction<RequestFormValues>>
  requests: PbcRequestItem[]
  currentRequestId: string | null
  members: Array<{ id: string; name: string; email: string }>
  busy: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const candidates = requests.filter((request) => request.id !== currentRequestId)
  const set = <K extends keyof RequestFormValues>(key: K, value: RequestFormValues[K]) => setForm((current) => ({ ...current, [key]: value }))
  const toggleDependency = (id: string, checked: boolean) => set('dependency_ids', checked
    ? [...form.dependency_ids, id]
    : form.dependency_ids.filter((value) => value !== id))

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit PBC request' : 'Add PBC request'}</DialogTitle>
        <DialogDescription>Configure the request, evidence expectations, ownership, and internal tracking details.</DialogDescription>
      </DialogHeader>
      <form className="space-y-6" onSubmit={onSubmit}>
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Request details</h3>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-2"><Label htmlFor="pbc-request-number">Request number</Label><Input id="pbc-request-number" required={editing} value={form.request_number} onChange={(event) => set('request_number', event.target.value)} placeholder="Auto-generated" /></div>
            <div className="space-y-2"><Label htmlFor="pbc-request-position">List position</Label><Input id="pbc-request-position" required type="number" min={1} max={Math.max(1, requests.length + (editing ? 0 : 1))} value={form.position} onChange={(event) => set('position', event.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="pbc-request-title">Title</Label><Input id="pbc-request-title" required maxLength={500} value={form.title} onChange={(event) => set('title', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pbc-request-description">Description / client instructions</Label><Textarea id="pbc-request-description" rows={4} maxLength={20000} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Explain what to provide, scope, cut-off, and any preparation instructions." /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pbc-request-category">Category</Label><Input id="pbc-request-category" maxLength={128} value={form.category} onChange={(event) => set('category', event.target.value)} /></div>
            <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(value) => set('priority', value as PbcRequestItem['priority'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="pbc-request-due">Due date</Label><Input id="pbc-request-due" type="date" value={form.due_date} onChange={(event) => set('due_date', event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="pbc-request-period">Period end</Label><Input id="pbc-request-period" type="date" value={form.period_end} onChange={(event) => set('period_end', event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Internal owner</Label><Select value={form.owner_user_id || '__unassigned'} onValueChange={(value) => set('owner_user_id', value === '__unassigned' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__unassigned">{editing ? 'Unassigned' : 'Current user (default)'}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}{member.name !== member.email ? ` · ${member.email}` : ''}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <div><h3 className="text-sm font-semibold">Evidence expectations</h3><p className="mt-1 text-xs text-foreground-muted">These instructions are shown to the client before upload.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pbc-expected-filename">Expected filename</Label><Input id="pbc-expected-filename" maxLength={500} value={form.expected_filename} onChange={(event) => set('expected_filename', event.target.value)} placeholder="bank_reconciliation_2026.xlsx" /></div>
            <div className="space-y-2"><Label htmlFor="pbc-expected-formats">Expected formats</Label><Input id="pbc-expected-formats" value={form.expected_formats} onChange={(event) => set('expected_formats', event.target.value)} placeholder="xlsx, csv, pdf" /><p className="text-xs text-foreground-muted">Separate multiple extensions with commas.</p></div>
            <div className="space-y-2"><Label htmlFor="pbc-gl-account">GL account</Label><Input id="pbc-gl-account" maxLength={128} value={form.gl_account} onChange={(event) => set('gl_account', event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="pbc-gl-balance">Expected GL balance</Label><Input id="pbc-gl-balance" maxLength={64} value={form.gl_balance} onChange={(event) => set('gl_balance', event.target.value)} placeholder="125000.00" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-0.5 size-4" type="checkbox" checked={form.sensitive} onChange={(event) => set('sensitive', event.target.checked)} /><span><span className="block font-medium">Sensitive evidence</span><span className="text-xs text-foreground-muted">Flag the request for heightened handling.</span></span></label>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-0.5 size-4" type="checkbox" checked={form.requires_redaction} onChange={(event) => set('requires_redaction', event.target.checked)} /><span><span className="block font-medium">Redaction required</span><span className="text-xs text-foreground-muted">Tell the client to remove protected information.</span></span></label>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <h3 className="text-sm font-semibold">Dependencies and source tracking</h3>
          <div className="space-y-2"><Label htmlFor="pbc-external-source">External source ID</Label><Input id="pbc-external-source" maxLength={255} value={form.external_source_id} onChange={(event) => set('external_source_id', event.target.value)} placeholder="Optional auditor or source-system identifier" /></div>
          <div className="space-y-2"><Label>Depends on</Label>{candidates.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-xs text-foreground-muted">No other requests are available.</p> : <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">{candidates.map((request) => <label key={request.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-muted"><input type="checkbox" checked={form.dependency_ids.includes(request.id)} onChange={(event) => toggleDependency(request.id, event.target.checked)} /><span className="font-mono text-xs text-foreground-muted">{request.request_number}</span><span className="truncate">{request.title}</span></label>)}</div>}</div>
        </section>

        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!form.title.trim() || busy === 'create' || busy === 'edit'}>{busy === 'create' || busy === 'edit' ? 'Saving…' : editing ? 'Save changes' : 'Add request'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}

function RequestDetail({ request, requests, busy, onRun, onEdit, onUpload, onComment, comment, setComment, visibility, setVisibility }: {
  request: PbcRequestItem
  requests: PbcRequestItem[]
  busy: string | null
  onRun: (key: string, action: () => Promise<unknown>) => Promise<void>
  onEdit: () => void
  onUpload: () => void
  onComment: (event: React.FormEvent) => void
  comment: string
  setComment: (value: string) => void
  visibility: 'client' | 'internal'
  setVisibility: (value: 'client' | 'internal') => void
}) {
  const canUpload = ['open', 'needs_changes'].includes(request.status)
  const dependencies = request.dependency_ids.map((id) => requests.find((item) => item.id === id)).filter(Boolean) as PbcRequestItem[]
  return <div className="flex h-full flex-col">
    <div className="border-b p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-foreground-muted">{request.request_number}</p><h2 className="mt-1 font-semibold leading-snug">{request.title}</h2></div><Badge className={statusStyle[request.status]}>{formatStatus(request.status)}</Badge></div>{request.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground-muted">{request.description}</p>}<dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-foreground-muted">Owner</dt><dd className="mt-0.5">{request.owner_name || 'Unassigned'}</dd></div><div><dt className="text-xs text-foreground-muted">Due</dt><dd className="mt-0.5">{request.due_date || 'No date'}</dd></div><div><dt className="text-xs text-foreground-muted">Priority</dt><dd className="mt-0.5">{formatStatus(request.priority)}</dd></div><div><dt className="text-xs text-foreground-muted">Period end</dt><dd className="mt-0.5">{request.period_end || 'Not specified'}</dd></div></dl></div>
    <div className="space-y-5 overflow-y-auto p-5">
      {request.status_reason && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>Reviewer note:</strong> {request.status_reason}</div>}
      <section><h3 className="mb-2 text-sm font-medium">Configured expectations</h3><dl className="space-y-2 rounded-lg bg-surface-muted p-3 text-sm"><div><dt className="text-xs text-foreground-muted">Filename</dt><dd>{request.expected_filename || 'Any filename'}</dd></div><div><dt className="text-xs text-foreground-muted">Formats</dt><dd>{request.expected_formats.length ? request.expected_formats.map((format) => `.${format}`).join(', ') : 'Any permitted format'}</dd></div>{request.gl_account && <div><dt className="text-xs text-foreground-muted">GL account</dt><dd>{request.gl_account}{request.gl_balance ? ` · ${request.gl_balance}` : ''}</dd></div>}{dependencies.length > 0 && <div><dt className="text-xs text-foreground-muted">Depends on</dt><dd>{dependencies.map((item) => item.request_number).join(', ')}</dd></div>}<div className="flex flex-wrap gap-2">{request.sensitive && <Badge variant="outline">Sensitive</Badge>}{request.requires_redaction && <Badge variant="outline">Redaction required</Badge>}{request.external_source_id && <Badge variant="outline">Source: {request.external_source_id}</Badge>}</div></dl></section>
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">Evidence</h3>{canUpload && <Button size="sm" variant="outline" onClick={onUpload} disabled={busy === 'upload'}><Upload className="mr-2 size-3.5" />{busy === 'upload' ? 'Uploading…' : 'Upload'}</Button>}</div><div className="space-y-2">{request.documents.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-foreground-muted">No evidence uploaded yet.</p>}{request.documents.map((document) => <button key={document.id} onClick={() => pbcApi.download(document.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-surface-muted"><File className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.filename}</span><span className="block text-xs text-foreground-muted">v{document.version} · {formatBytes(document.size_bytes)}</span></span><Download className="size-3.5 text-foreground-muted" /></button>)}</div></section>
      <section><h3 className="mb-2 text-sm font-medium">Conversation</h3><div className="space-y-2">{request.comments.length === 0 && <p className="text-xs text-foreground-muted">No comments yet.</p>}{request.comments.map((item) => <div key={item.id} className={cn('rounded-lg p-3 text-sm', item.visibility === 'internal' ? 'bg-amber-50' : 'bg-surface-muted')}><div className="flex items-center gap-2 text-xs text-foreground-muted"><span className="font-medium text-foreground">{item.actor_name}</span><span>{item.visibility === 'internal' ? 'Internal note' : 'Client-visible'}</span></div><p className="mt-1 whitespace-pre-wrap">{item.body}</p></div>)}</div><form className="mt-3 space-y-2" onSubmit={onComment}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment or internal note…" rows={3} /><div className="flex items-center gap-2"><Select value={visibility} onValueChange={(value) => setVisibility(value as 'client' | 'internal')}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">Client-visible</SelectItem><SelectItem value="internal">Internal note</SelectItem></SelectContent></Select><Button size="sm" className="ml-auto" disabled={!comment.trim() || busy === 'comment'}><MessageSquare className="mr-2 size-3.5" />Comment</Button></div></form></section>
      <section className="flex flex-wrap gap-2 border-t pt-4">{['draft', 'open', 'needs_changes'].includes(request.status) && <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-2 size-3.5" />Edit all details</Button>}{request.status === 'submitted' && <><Button size="sm" onClick={() => onRun('accept', () => pbcApi.transition(request.id, 'accept', request.revision))}><Check className="mr-2 size-3.5" />Accept</Button><Button size="sm" variant="outline" onClick={() => { const reason = window.prompt('What should the client change?'); if (reason) onRun('return', () => pbcApi.transition(request.id, 'return', request.revision, reason)) }}>Return</Button></>}{['open', 'needs_changes'].includes(request.status) && <Button size="sm" variant="ghost" onClick={() => onRun('waive', () => pbcApi.transition(request.id, 'waive', request.revision, 'Waived by firm'))}>Waive request</Button>}{['accepted', 'waived'].includes(request.status) && <Button size="sm" variant="ghost" onClick={() => onRun('reopen', () => pbcApi.transition(request.id, 'reopen', request.revision, 'Reopened by firm'))}>Reopen</Button>}</section>
      {request.status === 'draft' && <section className="border-t pt-4"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Delete ${request.request_number}?`)) onRun('delete', () => pbcApi.deleteRequest(request.id)) }}>Delete draft request</Button></section>}
    </div>
  </div>
}
