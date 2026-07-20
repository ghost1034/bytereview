'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { EnvelopeStatusBadge } from '@/components/ui/envelope-status-badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useDeleteEnvelope, useEnvelopes, useEsignContext, useEsignInbox } from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

type QuickView = 'all' | 'inbox' | 'draft' | 'scheduled' | 'send_failed' | 'active' | 'completed' | 'declined' | 'voided' | 'expired'
type SortBy = 'updated_at' | 'created_at' | 'sent_at' | 'completed_at' | 'title'

const QUICK_VIEWS: { id: QuickView; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'inbox', label: 'Awaiting my signature' },
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'send_failed', label: 'Send failed' },
  { id: 'active', label: 'Sent / In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'declined', label: 'Declined' },
  { id: 'voided', label: 'Voided' },
  { id: 'expired', label: 'Expired' },
]

function formatActivity(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default function EsignManagePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const view = (searchParams.get('view') as QuickView | null) ?? 'all'
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0)
  const sortBy = (searchParams.get('sort_by') as SortBy | null) ?? 'updated_at'
  const sortDir = searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc'
  const query = searchParams.get('q') ?? ''
  const source = searchParams.get('source') as 'manual' | 'bulk' | 'powerform' | null
  const scope = (searchParams.get('scope') as 'mine' | 'shared' | 'firm' | null) ?? 'mine'
  const esignContext = useEsignContext()
  const canViewFirm = !!esignContext.data && (esignContext.data.profile.admin_override || esignContext.data.administrative_capabilities.view_firm_envelopes)
  const effectiveScope = scope === 'firm' && !canViewFirm ? 'mine' : scope
  const [search, setSearch] = React.useState(query)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; title: string } | null>(null)

  const setParams = React.useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(patch).forEach(([key, value]) => {
      if (!value || (key === 'offset' && value === '0')) next.delete(key)
      else next.set(key, value)
    })
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  React.useEffect(() => setSearch(query), [query])
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== query) setParams({ q: search.trim() || null, offset: null })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query, search, setParams])

  const status = view === 'all' || view === 'inbox' ? undefined : view
  const envelopesQuery = useEnvelopes({
    limit: PAGE_SIZE,
    offset,
    status,
    q: query || undefined,
    sortBy,
    sortDir,
    sourceType: source ?? undefined,
    scope: effectiveScope,
  })
  const inboxQuery = useEsignInbox({ q: query || undefined, state: 'pending' })
  const deleteEnvelope = useDeleteEnvelope()
  const inboxItems = (inboxQuery.data?.items ?? []).filter((item) => item.role !== 'cc')
  const counts = (envelopesQuery.data as typeof envelopesQuery.data & { status_counts?: Record<string, number> })?.status_counts ?? {}
  const activeCount = (counts.sent ?? 0) + (counts.in_progress ?? 0)

  const countFor = (id: QuickView) => {
    if (id === 'all') return Object.values(counts).reduce((sum, count) => sum + count, 0)
    if (id === 'inbox') return inboxItems.length
    if (id === 'active') return activeCount
    return counts[id] ?? 0
  }

  const isLoading = view === 'inbox' ? inboxQuery.isLoading : envelopesQuery.isLoading
  const total = view === 'inbox' ? inboxItems.length : envelopesQuery.data?.total ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Manage</p>
          <h1 className="text-2xl font-semibold tracking-tight">Envelopes</h1>
          <p className="mt-1 text-sm text-foreground-muted">Track documents, recipients, and signing progress.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/esign/new"><Plus className="mr-1.5 size-4" /> New envelope</Link>
        </Button>
      </div>

      <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-muted/40 p-3 md:border-b-0 md:border-r">
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">Quick views</p>
          <nav className="space-y-0.5" aria-label="Envelope quick views">
            {QUICK_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ view: item.id === 'all' ? null : item.id, offset: null })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === item.id ? 'bg-primary-soft font-medium text-primary' : 'text-foreground-muted hover:bg-surface hover:text-foreground',
                )}
              >
                <span>{item.label}</span>
                <span className="ml-2 tabular-nums text-xs opacity-75">{countFor(item.id)}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search envelopes"
                aria-label="Search envelopes"
                className="pl-9"
              />
            </div>
            {view !== 'inbox' && (
              <><Select value={effectiveScope} onValueChange={(value) => setParams({ scope: value === 'mine' ? null : value, offset: null })}><SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mine">My envelopes</SelectItem><SelectItem value="shared">Shared</SelectItem>{canViewFirm && <SelectItem value="firm">Firm-wide</SelectItem>}</SelectContent></Select><Select value={source ?? 'all'} onValueChange={(value) => setParams({ source: value === 'all' ? null : value, offset: null })}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="bulk">Bulk</SelectItem><SelectItem value="powerform">PowerForm</SelectItem></SelectContent></Select><Select value={`${sortBy}:${sortDir}`} onValueChange={(value) => {
                const [nextSort, nextDir] = value.split(':')
                setParams({ sort_by: nextSort, sort_dir: nextDir, offset: null })
              }}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_at:desc">Recently updated</SelectItem>
                  <SelectItem value="created_at:desc">Recently created</SelectItem>
                  <SelectItem value="title:asc">Title A–Z</SelectItem>
                  <SelectItem value="sent_at:desc">Recently sent</SelectItem>
                  <SelectItem value="completed_at:desc">Recently completed</SelectItem>
                </SelectContent>
              </Select></>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : view === 'inbox' ? (
            inboxItems.length === 0 ? (
              <EmptyState icon={FileSignature} title="Nothing waiting for you" description="Signature requests assigned to you appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {inboxItems.map((item) => (
                  <li key={item.envelope_id}>
                    <button type="button" onClick={() => router.push(`/dashboard/esign/sign/${item.envelope_id}`)} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-surface-muted/50 sm:grid-cols-[minmax(0,1fr)_180px_130px] sm:items-center">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs text-foreground-muted">From {item.sender_email}</span></span>
                      <span className="text-xs text-foreground-muted">{item.is_my_turn ? 'Ready for your signature' : 'Waiting on others'}</span>
                      <span className="text-xs text-foreground-muted">{formatActivity(item.sent_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (envelopesQuery.data?.envelopes.length ?? 0) === 0 ? (
            <EmptyState icon={FileSignature} title={query ? 'No matching envelopes' : 'No envelopes in this view'} description={query ? 'Try another search term or quick view.' : 'Create an envelope to send documents for signature.'} />
          ) : (
            <ul className="divide-y divide-border">
              {envelopesQuery.data!.envelopes.map((envelope) => {
                const preview = (envelope as typeof envelope & { recipient_preview?: { id: string; name: string; status: string }[] }).recipient_preview ?? []
                const href = envelope.status === 'draft' ? `/dashboard/esign/${envelope.id}/prepare` : `/dashboard/esign/${envelope.id}`
                return (
                  <li key={envelope.id} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 hover:bg-surface-muted/40 sm:grid-cols-[minmax(0,1fr)_150px_170px_44px]">
                    <button type="button" onClick={() => router.push(href)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="block truncate text-sm font-medium">{envelope.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                        {envelope.document_count} document{envelope.document_count === 1 ? '' : 's'}
                        {preview.length ? ` · ${preview.map((recipient) => recipient.name).join(', ')}` : ' · No recipients'}
                        {(envelope as typeof envelope & { owner_name?: string; owner_email?: string }).owner_email ? ` · Owned by ${(envelope as typeof envelope & { owner_name?: string; owner_email?: string }).owner_name || (envelope as typeof envelope & { owner_email?: string }).owner_email}` : ''}
                      </span>
                    </button>
                    <div><EnvelopeStatusBadge status={envelope.status} /><span className="mt-1 block text-[11px] tabular-nums text-foreground-subtle">{envelope.signed_count}/{envelope.recipient_count} signed</span></div>
                    <div className="hidden text-xs text-foreground-muted sm:block"><span className="block text-foreground-subtle">Last activity</span>{formatActivity(envelope.updated_at)}</div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${envelope.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(href)}><Pencil /> {envelope.status === 'draft' ? 'Resume draft' : 'View details'}</DropdownMenuItem>
                        {(envelope.status === 'sent' || envelope.status === 'in_progress') && envelope.available_actions?.includes('remind') && <DropdownMenuItem onClick={async () => { try { await apiClient.remindEsignEnvelope(envelope.id); toast({ title: 'Reminder sent' }) } catch (error) { toast({ title: 'Reminder failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><BellRing /> Send reminder</DropdownMenuItem>}
                        {envelope.status === 'send_failed' && <><DropdownMenuItem onClick={async () => { try { await apiClient.retryFailedEsignSend(envelope.id); await envelopesQuery.refetch(); toast({ title: 'Envelope sent' }) } catch (error) { toast({ title: 'Retry failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><RotateCcw /> Retry send</DropdownMenuItem><DropdownMenuItem onClick={async () => { try { await apiClient.recoverFailedEsignSendDraft(envelope.id); router.push(`/dashboard/esign/${envelope.id}/prepare`) } catch (error) { toast({ title: 'Could not recover draft', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><Pencil /> Edit before retry</DropdownMenuItem></>}
                        {envelope.status === 'draft' && envelope.available_actions?.includes('delete_draft') && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ id: envelope.id, title: envelope.title })}><Trash2 /> Delete draft</DropdownMenuItem></>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}

          {view !== 'inbox' && total > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-foreground-muted">
              <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" disabled={offset === 0} onClick={() => setParams({ offset: String(Math.max(0, offset - PAGE_SIZE)) })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                <Button size="icon" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setParams({ offset: String(offset + PAGE_SIZE) })} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete draft envelope?</AlertDialogTitle><AlertDialogDescription>“{deleteTarget?.title}” and its documents will be permanently deleted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={deleteEnvelope.isPending} onClick={async () => { if (!deleteTarget) return; try { await deleteEnvelope.mutateAsync(deleteTarget.id); toast({ title: 'Draft deleted' }) } catch (error) { toast({ title: 'Failed to delete draft', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } finally { setDeleteTarget(null) } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
