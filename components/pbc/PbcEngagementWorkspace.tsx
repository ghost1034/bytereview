'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, Bot, Check, ChevronRight, Download, File, FileSpreadsheet,
  MessageSquare, Plus, Send, Upload, X,
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
import { cn } from '@/lib/utils'
import { PbcClientAccess } from '@/components/pbc/PbcClientAccess'

const statusStyle: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', open: 'bg-blue-50 text-blue-700', submitted: 'bg-amber-50 text-amber-700',
  needs_changes: 'bg-rose-50 text-rose-700', accepted: 'bg-emerald-50 text-emerald-700', waived: 'bg-slate-100 text-slate-500',
}

const formatStatus = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
const formatBytes = (value: number) => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`

type CompletenessFlag = { request_id: string; request_number: string; warnings: string[] }

export function PbcEngagementWorkspace({ engagementId }: { engagementId: string }) {
  const engagement = usePbcEngagement(engagementId)
  const invalidate = useInvalidatePbc()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [aiOpen, setAiOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [newRequest, setNewRequest] = React.useState({ title: '', category: 'Other', due_date: '' })
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

  const addRequest = async (event: React.FormEvent) => {
    event.preventDefault()
    await run('create', async () => {
      const result = await pbcApi.createRequest(engagementId, { ...newRequest, due_date: newRequest.due_date || data?.due_date || null })
      setCreateOpen(false); setNewRequest({ title: '', category: 'Other', due_date: '' }); setSelectedId(result.id)
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
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1><Badge className={statusStyle[data.status]}>{formatStatus(data.status)}</Badge></div>
          <p className="mt-1 text-sm text-foreground-muted">{data.client_name}{data.period_end ? ` · Period ended ${data.period_end}` : ''}{data.due_date ? ` · Due ${data.due_date}` : ''}</p>
          <div className="mt-3 flex max-w-md items-center gap-3"><Progress value={data.progress} className="h-2" /><span className="text-sm font-medium tabular-nums">{data.progress}%</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={checkCompleteness} disabled={!!busy}><AlertTriangle className="mr-2 size-4" />{busy === 'flags' ? 'Checking…' : 'Check completeness'}</Button>
          <Button variant="outline" onClick={loadAi} disabled={!!busy || data.status !== 'draft'}><Bot className="mr-2 size-4" />Draft with AI</Button>
          <Button variant="outline" onClick={() => run('export', () => pbcApi.downloadArtifact(engagementId, 'export.xlsx', `${data.name}-pbc.xlsx`))}><Download className="mr-2 size-4" />Tracker</Button>
          <Button variant="outline" onClick={() => run('package', () => pbcApi.downloadArtifact(engagementId, 'package.zip', `${data.name}-evidence-package.zip`))}><Download className="mr-2 size-4" />Package</Button>
          {data.status === 'draft' && <Button onClick={() => run('publish', () => pbcApi.publish(engagementId))} disabled={!!busy}><Send className="mr-2 size-4" />Publish</Button>}
          {data.status === 'active' && <Button onClick={() => run('complete-engagement', () => pbcApi.engagementAction(engagementId, 'complete'))} disabled={!!busy}><Check className="mr-2 size-4" />Complete</Button>}
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span><button className="ml-auto" onClick={() => setError(null)} aria-label="Dismiss"><X className="size-4" /></button></div>}
      {flags && flags.length === 0 && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Check className="mt-0.5 size-4 shrink-0" /><span><strong>Completeness check passed.</strong> No items currently require attention.</span></div>}
      {flags && flags.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Completeness review found {flags.length} item{flags.length === 1 ? '' : 's'} requiring attention.</p><ul className="mt-2 list-disc space-y-1 pl-5">{flags.slice(0, 5).map((flag) => <li key={flag.request_id}><button className="underline" onClick={() => setSelectedId(flag.request_id)}>{flag.request_number}</button>: {flag.warnings.join('; ')}</li>)}</ul></div>}

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card shadow-sm xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0 border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div><h2 className="font-semibold">Request list</h2><p className="text-xs text-foreground-muted">{requests.length} request{requests.length === 1 ? '' : 's'}</p></div>
            <div className="flex gap-2">
              <input ref={importRef} className="hidden" type="file" accept=".xlsx,.csv" onChange={(e) => importList(e.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={data.status !== 'draft' || !!busy} onClick={() => importRef.current?.click()}><FileSpreadsheet className="mr-2 size-4" />Import</Button>
              <Button size="sm" disabled={data.status === 'completed' || data.status === 'archived'} onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Request</Button>
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
          {selected && <RequestDetail request={selected} busy={busy} onRun={run} onUpload={() => fileRef.current?.click()} onComment={addComment} comment={comment} setComment={setComment} visibility={commentVisibility} setVisibility={setCommentVisibility} />}
          <input ref={fileRef} className="hidden" type="file" onChange={(e) => uploadFile(e.target.files?.[0])} />
        </aside>
      </div>

      <PbcClientAccess engagement={data} requests={requests} busy={busy} onRun={run} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Add PBC request</DialogTitle><DialogDescription>Create one trackable evidence request for the client.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={addRequest}><div className="space-y-2"><Label>Request title</Label><Input required value={newRequest.title} onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Category</Label><Input value={newRequest.category} onChange={(e) => setNewRequest({ ...newRequest, category: e.target.value })} /></div><div className="space-y-2"><Label>Due date</Label><Input type="date" value={newRequest.due_date} onChange={(e) => setNewRequest({ ...newRequest, due_date: e.target.value })} /></div></div><Button className="w-full" disabled={busy === 'create'}>{busy === 'create' ? 'Adding…' : 'Add request'}</Button></form></DialogContent></Dialog>
      <Dialog open={aiOpen} onOpenChange={setAiOpen}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>AI request-list proposal</DialogTitle><DialogDescription>Review every suggestion before adding it. AI cannot publish or contact the client.</DialogDescription></DialogHeader>{busy === 'ai' && <p className="py-12 text-center text-sm text-foreground-muted">Drafting a request list from engagement metadata and firm templates…</p>}{ai && <div className="space-y-4"><p className="rounded-lg bg-surface-muted p-3 text-sm">{ai.summary}</p><div className="divide-y rounded-lg border">{ai.proposals.map((proposal, index) => <div key={index} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{String(proposal.title)}</p><p className="mt-1 text-sm text-foreground-muted">{String(proposal.description || '')}</p></div><Badge variant="outline">{String(proposal.category || 'Other')}</Badge></div><p className="mt-2 text-xs text-foreground-muted">Why suggested: {String(proposal.rationale || 'Engagement context')}</p></div>)}</div><Button className="w-full" onClick={applyAi} disabled={busy === 'ai-apply'}>{busy === 'ai-apply' ? 'Adding requests…' : `Confirm and add ${ai.proposals.length} requests`}</Button></div>}</DialogContent></Dialog>
    </div>
  )
}

function RequestDetail({ request, busy, onRun, onUpload, onComment, comment, setComment, visibility, setVisibility }: {
  request: PbcRequestItem
  busy: string | null
  onRun: (key: string, action: () => Promise<unknown>) => Promise<void>
  onUpload: () => void
  onComment: (event: React.FormEvent) => void
  comment: string
  setComment: (value: string) => void
  visibility: 'client' | 'internal'
  setVisibility: (value: 'client' | 'internal') => void
}) {
  const canUpload = ['open', 'needs_changes'].includes(request.status)
  return <div className="flex h-full flex-col">
    <div className="border-b p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-foreground-muted">{request.request_number}</p><h2 className="mt-1 font-semibold leading-snug">{request.title}</h2></div><Badge className={statusStyle[request.status]}>{formatStatus(request.status)}</Badge></div>{request.description && <p className="mt-3 text-sm leading-6 text-foreground-muted">{request.description}</p>}<dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-foreground-muted">Owner</dt><dd className="mt-0.5">{request.owner_name || 'Unassigned'}</dd></div><div><dt className="text-xs text-foreground-muted">Due</dt><dd className="mt-0.5">{request.due_date || 'No date'}</dd></div></dl></div>
    <div className="space-y-5 overflow-y-auto p-5">
      {request.status_reason && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>Reviewer note:</strong> {request.status_reason}</div>}
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">Evidence</h3>{canUpload && <Button size="sm" variant="outline" onClick={onUpload} disabled={busy === 'upload'}><Upload className="mr-2 size-3.5" />{busy === 'upload' ? 'Uploading…' : 'Upload'}</Button>}</div><div className="space-y-2">{request.documents.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-foreground-muted">No evidence uploaded yet.</p>}{request.documents.map((document) => <button key={document.id} onClick={() => pbcApi.download(document.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-surface-muted"><File className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.filename}</span><span className="block text-xs text-foreground-muted">v{document.version} · {formatBytes(document.size_bytes)}</span></span><Download className="size-3.5 text-foreground-muted" /></button>)}</div></section>
      <section><h3 className="mb-2 text-sm font-medium">Conversation</h3><div className="space-y-2">{request.comments.length === 0 && <p className="text-xs text-foreground-muted">No comments yet.</p>}{request.comments.map((item) => <div key={item.id} className={cn('rounded-lg p-3 text-sm', item.visibility === 'internal' ? 'bg-amber-50' : 'bg-surface-muted')}><div className="flex items-center gap-2 text-xs text-foreground-muted"><span className="font-medium text-foreground">{item.actor_name}</span><span>{item.visibility === 'internal' ? 'Internal note' : 'Client-visible'}</span></div><p className="mt-1 whitespace-pre-wrap">{item.body}</p></div>)}</div><form className="mt-3 space-y-2" onSubmit={onComment}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment or internal note…" rows={3} /><div className="flex items-center gap-2"><Select value={visibility} onValueChange={(value) => setVisibility(value as 'client' | 'internal')}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">Client-visible</SelectItem><SelectItem value="internal">Internal note</SelectItem></SelectContent></Select><Button size="sm" className="ml-auto" disabled={!comment.trim() || busy === 'comment'}><MessageSquare className="mr-2 size-3.5" />Comment</Button></div></form></section>
      <section className="flex flex-wrap gap-2 border-t pt-4">{['draft', 'open', 'needs_changes'].includes(request.status) && <Button size="sm" variant="outline" onClick={() => { const title = window.prompt('Request title', request.title); if (!title) return; const due = window.prompt('Due date (YYYY-MM-DD)', request.due_date || '') ?? request.due_date; onRun('edit', () => pbcApi.updateRequest(request.id, { title, due_date: due || null, expected_revision: request.revision })) }}>Edit request</Button>}{request.status === 'submitted' && <><Button size="sm" onClick={() => onRun('accept', () => pbcApi.transition(request.id, 'accept', request.revision))}><Check className="mr-2 size-3.5" />Accept</Button><Button size="sm" variant="outline" onClick={() => { const reason = window.prompt('What should the client change?'); if (reason) onRun('return', () => pbcApi.transition(request.id, 'return', request.revision, reason)) }}>Return</Button></>}{['open', 'needs_changes'].includes(request.status) && <Button size="sm" variant="ghost" onClick={() => onRun('waive', () => pbcApi.transition(request.id, 'waive', request.revision, 'Waived by firm'))}>Waive request</Button>}{['accepted', 'waived'].includes(request.status) && <Button size="sm" variant="ghost" onClick={() => onRun('reopen', () => pbcApi.transition(request.id, 'reopen', request.revision, 'Reopened by firm'))}>Reopen</Button>}</section>
      {request.status === 'draft' && <section className="border-t pt-4"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Delete ${request.request_number}?`)) onRun('delete', () => pbcApi.deleteRequest(request.id)) }}>Delete draft request</Button></section>}
    </div>
  </div>
}
