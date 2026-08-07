'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Clock3, Download, File, LockKeyhole, MessageSquare, Upload } from 'lucide-react'

import { portalRequest } from '@/lib/pbc/api'
import type { PbcEngagement, PbcRequestItem } from '@/lib/pbc/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const CSRF_KEY = 'pbc_portal_csrf'
const statusTone: Record<string, string> = { open: 'bg-blue-50 text-blue-700', submitted: 'bg-amber-50 text-amber-700', needs_changes: 'bg-rose-50 text-rose-700', accepted: 'bg-emerald-50 text-emerald-700', waived: 'bg-slate-100 text-slate-500' }
const label = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())

function Portal() {
  const search = useSearchParams()
  const token = search.get('token')
  const [csrf, setCsrf] = React.useState<string | null>(null)
  const [workspace, setWorkspace] = React.useState<(PbcEngagement & { requests: PbcRequestItem[]; contact: { name: string; email: string }; portal_brand: { portal_name: string; logo_url?: string | null } }) | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [comment, setComment] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const loadWorkspace = React.useCallback(async () => {
    const result = await portalRequest<typeof workspace>('/workspace')
    setWorkspace(result)
    setSelectedId((current) => current || result?.requests[0]?.id || null)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        let activeCsrf = sessionStorage.getItem(CSRF_KEY)
        if (token) {
          const exchanged = await portalRequest<{ csrf_token: string }>('/exchange', { method: 'POST', body: JSON.stringify({ token }) })
          activeCsrf = exchanged.csrf_token
          sessionStorage.setItem(CSRF_KEY, activeCsrf)
          window.history.replaceState({}, '', '/pbc/access')
        }
        if (!activeCsrf) throw new Error('Open the secure link from your PBC invitation email.')
        if (!cancelled) setCsrf(activeCsrf)
        const result = await portalRequest<typeof workspace>('/workspace')
        if (!cancelled) {
          setWorkspace(result)
          setSelectedId(result?.requests[0]?.id || null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The secure portal could not be opened.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [token])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await action(); await loadWorkspace() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(null) }
  }

  const selected = workspace?.requests.find((item) => item.id === selectedId)

  const upload = async (file?: File) => {
    if (!file || !selected || !csrf) return
    await run('upload', async () => {
      const initiated = await portalRequest<{ document: { id: string }; upload_url: string; content_type: string }>(`/requests/${selected.id}/files:initiate`, {
        method: 'POST', body: JSON.stringify({ filename: file.name, content_type: file.type || 'application/octet-stream', size: file.size }),
      }, csrf)
      const put = await fetch(initiated.upload_url, { method: 'PUT', headers: { 'Content-Type': initiated.content_type }, body: file })
      if (!put.ok) throw new Error('The secure file upload failed.')
      await portalRequest('/files:complete', { method: 'POST', body: JSON.stringify({ document_id: initiated.document.id }) }, csrf)
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !comment.trim() || !csrf) return
    await run('comment', async () => {
      await portalRequest(`/requests/${selected.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment.trim(), visibility: 'client' }) }, csrf)
      setComment('')
    })
  }

  const submit = () => {
    if (!selected || !csrf) return
    run('submit', () => portalRequest(`/requests/${selected.id}/submit`, {
      method: 'POST', body: JSON.stringify({ action: 'submit', expected_revision: selected.revision }),
    }, csrf))
  }

  const download = async (documentId: string) => {
    const result = await portalRequest<{ url: string }>(`/documents/${documentId}/download-url`)
    window.location.assign(result.url)
  }

  if (loading) return <PortalShell><div className="flex min-h-[500px] items-center justify-center text-sm text-slate-500">Opening your secure workspace…</div></PortalShell>
  if (!workspace) {
    const unpublished = error === 'This engagement has not been published yet'
    return <PortalShell><div className="mx-auto max-w-lg py-24 text-center"><AlertCircle className="mx-auto size-10 text-rose-500" /><h1 className="mt-4 text-xl font-semibold">{unpublished ? error : 'This secure link is unavailable'}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{unpublished ? 'Your accounting contact needs to publish it before this portal link can be used.' : error}</p><p className="mt-4 text-xs text-slate-500">{unpublished ? 'Please try this link again after the engagement is published.' : 'Ask your accounting contact to send a new PBC portal link.'}</p></div></PortalShell>
  }

  const completed = workspace.requests.filter((item) => ['submitted', 'accepted', 'waived'].includes(item.status)).length
  const progress = workspace.requests.length ? Math.round(completed / workspace.requests.length * 100) : 0

  return <PortalShell portalName={workspace.portal_brand.portal_name} logoUrl={workspace.portal_brand.logo_url}>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-blue-700">{workspace.client_name}</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">{workspace.name}</h1><p className="mt-2 text-sm text-slate-600">Welcome, {workspace.contact.name}. Upload the requested evidence and submit each item when it is ready for review.</p></div><div className="rounded-xl bg-slate-50 px-4 py-3 text-right"><p className="text-2xl font-semibold tabular-nums text-slate-950">{progress}%</p><p className="text-xs text-slate-500">{completed} of {workspace.requests.length} ready</p></div></div>
        <Progress value={progress} className="mt-5 h-2" />
      </header>
      {error && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="size-4" />{error}</div>}
      <div className="grid min-h-[600px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_minmax(0,1fr)]">
        <nav className="border-b border-slate-200 lg:border-b-0 lg:border-r" aria-label="PBC requests">
          <div className="border-b border-slate-200 p-4"><h2 className="font-medium text-slate-950">Your requests</h2><p className="text-xs text-slate-500">Select an item to respond.</p></div>
          <div className="divide-y divide-slate-100">{workspace.requests.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cn('w-full p-4 text-left hover:bg-slate-50', selectedId === item.id && 'bg-blue-50/70')}><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-slate-500">{item.request_number}</span><Badge className={statusTone[item.status]}>{label(item.status)}</Badge></div><p className="mt-2 text-sm font-medium leading-5 text-slate-950">{item.title}</p><div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-3" />{item.due_date ? `Due ${item.due_date}` : 'No due date'}</div></button>)}</div>
        </nav>
        <main className="min-w-0">
          {selected && <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{selected.request_number} · {selected.category || 'Other'}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.title}</h2></div><Badge className={statusTone[selected.status]}>{label(selected.status)}</Badge></div>{selected.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selected.description}</p>}{selected.status_reason && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>Reviewer requested changes:</strong> {selected.status_reason}</div>}</div>
            <div className="grid flex-1 gap-6 p-6 xl:grid-cols-2">
              <section><div className="flex items-center justify-between"><div><h3 className="font-medium text-slate-950">Evidence</h3><p className="text-xs text-slate-500">Files are virus-scanned and versioned.</p></div>{['open', 'needs_changes'].includes(selected.status) && <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy === 'upload'}><Upload className="mr-2 size-4" />{busy === 'upload' ? 'Scanning…' : 'Upload'}</Button>}</div><input ref={inputRef} className="hidden" type="file" onChange={(event) => upload(event.target.files?.[0])} /><div className="mt-4 space-y-2">{selected.documents.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><File className="mx-auto size-7 text-slate-400" /><p className="mt-2 text-sm text-slate-500">No files uploaded yet.</p></div>}{selected.documents.map((document) => <button key={document.id} onClick={() => download(document.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><File className="size-4 text-blue-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{document.filename}</span><span className="text-xs text-slate-500">Version {document.version} · {document.scan_status}</span></span><Download className="size-4 text-slate-400" /></button>)}</div>{['open', 'needs_changes'].includes(selected.status) && <Button className="mt-4 w-full" onClick={submit} disabled={busy === 'submit' || selected.documents.filter((item) => item.state === 'available').length === 0}><CheckCircle2 className="mr-2 size-4" />{busy === 'submit' ? 'Submitting…' : 'Submit for review'}</Button>}{selected.status === 'submitted' && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Submitted for firm review. You will be notified if changes are needed.</div>}{selected.status === 'accepted' && <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Accepted by the firm. No further action is needed.</div>}</section>
              <section><h3 className="font-medium text-slate-950">Conversation</h3><p className="text-xs text-slate-500">Messages here stay attached to this request.</p><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{selected.comments.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No messages yet.</p>}{selected.comments.map((item) => <div key={item.id} className={cn('rounded-xl p-3 text-sm', item.actor_kind === 'client' ? 'ml-6 bg-blue-50' : 'mr-6 bg-slate-100')}><p className="text-xs font-medium text-slate-600">{item.actor_name}</p><p className="mt-1 whitespace-pre-wrap text-slate-900">{item.body}</p></div>)}</div><form className="mt-4 space-y-2" onSubmit={addComment}><Textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ask a question or add context…" /><Button className="w-full" variant="outline" disabled={!comment.trim() || busy === 'comment'}><MessageSquare className="mr-2 size-4" />Send message</Button></form></section>
            </div>
          </div>}
        </main>
      </div>
    </div>
  </PortalShell>
}

function PortalShell({ children, portalName = 'CPAAutomation PBC', logoUrl }: { children: React.ReactNode; portalName?: string; logoUrl?: string | null }) {
  return <div className="min-h-dvh bg-slate-50 text-slate-950"><div className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><div className="flex items-center gap-2 font-semibold">{logoUrl ? <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" /> : <span className="flex size-8 items-center justify-center rounded-lg bg-blue-700 text-white">P</span>}{portalName}</div><div className="flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3.5" />Secure client portal</div></div></div>{children}</div>
}

export default function PbcAccessPage() {
  return <Suspense fallback={<PortalShell><div className="p-12 text-center text-sm text-slate-500">Opening secure portal…</div></PortalShell>}><Portal /></Suspense>
}
