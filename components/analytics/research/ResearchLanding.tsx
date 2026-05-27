'use client'

import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Clock,
  File as FileIcon,
  FileText,
  MessageSquare,
  Plus,
  Users,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/hooks/use-toast'
import {
  useAnalyticsResearchSessions,
  useUpdateAnalyticsResearchSession,
  type ResearchBot,
} from '@/hooks/useAnalyticsResearchSessions'
import type { AnalyticsChatSession, AnalyticsUploadedDoc } from '@/lib/analytics/types'
import type { SelectedResearchClient } from './ResearchBot'

const BOT_TITLE: Record<ResearchBot, string> = {
  irs: 'IRS Researcher',
  gaap: 'GAAP Researcher',
}

const BOT_DESCRIPTION: Record<ResearchBot, string> = {
  irs: 'AI-powered tax research assistant for IRS regulations and the tax code.',
  gaap: 'AI-powered accounting standards research assistant for ASC and FASB guidance.',
}

/** A model turn that produced a formal research/accounting memorandum. */
const MEMO_PATTERN = /MEMORANDUM/i

type LandingTab = 'overview' | 'history' | 'library'

interface ResearchLandingProps {
  bot: ResearchBot
  client: SelectedResearchClient
  onChangeClient: () => void
  onNewSession: () => void
  onOpenSession: (sessionId: string) => void
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'Recently'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Recently' : d.toLocaleDateString()
}

function isMemoSession(session: AnalyticsChatSession): boolean {
  return (session.messages ?? []).some(
    (m) => m.role === 'model' && MEMO_PATTERN.test(m.content),
  )
}

export function ResearchLanding({
  bot,
  client,
  onChangeClient,
  onNewSession,
  onOpenSession,
}: ResearchLandingProps) {
  const { data, isLoading } = useAnalyticsResearchSessions(bot)
  const updateSession = useUpdateAnalyticsResearchSession()
  const { toast } = useToast()
  const [tab, setTab] = useState<LandingTab>('overview')

  const sessions = useMemo<AnalyticsChatSession[]>(() => {
    const all = data?.sessions ?? []
    return all.filter((s) =>
      client.id === 'general' ? !s.client_id : s.client_id === client.id,
    )
  }, [data?.sessions, client.id])

  const docsAnalyzed = useMemo(
    () => sessions.reduce((acc, s) => acc + (s.uploadedDocs?.length ?? 0), 0),
    [sessions],
  )

  const memoSessions = useMemo(() => sessions.filter(isMemoSession), [sessions])

  const libraryDocs = useMemo(() => {
    const out: Array<{ doc: AnalyticsUploadedDoc; sessionId: string; sessionTitle: string }> = []
    for (const s of sessions) {
      for (const doc of s.uploadedDocs ?? []) {
        out.push({ doc, sessionId: s.id, sessionTitle: s.title || 'Untitled Session' })
      }
    }
    return out
  }, [sessions])

  const handleDeleteDoc = async (sessionId: string, docId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    const remaining = (session.uploadedDocs ?? []).filter((d) => d.id !== docId)
    try {
      await updateSession.mutateAsync({ bot, sessionId, data: { uploadedDocs: remaining } })
      toast({ title: 'Document removed' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove document.',
        variant: 'destructive',
      })
    }
  }

  const clientLabel = client.id === 'general' ? null : client.name

  return (
    <div className="space-y-8">
      <PageHeader
        title={BOT_TITLE[bot]}
        description={BOT_DESCRIPTION[bot]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onChangeClient}>
              <Users className="mr-1.5 size-4" aria-hidden />
              {clientLabel ?? 'General research'}
            </Button>
            <Button onClick={onNewSession}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New research session
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'history', label: 'Session History' },
            { id: 'library', label: 'Document Library' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground-muted hover:border-border hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState variant="table" label="Loading sessions" />
      ) : tab === 'overview' ? (
        <div className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <StatCard icon={MessageSquare} label="Total Sessions" value={sessions.length} />
            <StatCard icon={FileText} label="Docs Analyzed" value={docsAnalyzed} />
            <StatCard icon={FileIcon} label="Memos Generated" value={memoSessions.length} />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <ListCard title="Recent Sessions" icon={Clock} empty="No sessions yet.">
              {sessions.slice(0, 3).map((s) => (
                <SessionRow
                  key={s.id}
                  title={s.title || 'Untitled Session'}
                  meta={formatDate(s.updated_at)}
                  onClick={() => onOpenSession(s.id)}
                />
              ))}
            </ListCard>

            <ListCard title="Saved Memos" icon={FileText} empty="No memos generated yet.">
              {memoSessions.slice(0, 3).map((s) => (
                <SessionRow
                  key={s.id}
                  title={s.title || 'Untitled Session'}
                  meta={formatDate(s.updated_at)}
                  onClick={() => onOpenSession(s.id)}
                />
              ))}
            </ListCard>
          </div>
        </div>
      ) : tab === 'history' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-foreground-muted">
              <tr>
                <th className="p-4 font-semibold">Session Title</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Messages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-foreground-muted">
                    No session history found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer transition-colors hover:bg-surface-muted"
                    onClick={() => onOpenSession(s.id)}
                  >
                    <td className="p-4 font-medium text-foreground">
                      {s.title || 'Untitled Session'}
                    </td>
                    <td className="p-4 text-foreground-muted">{formatDate(s.updated_at)}</td>
                    <td className="p-4 text-foreground-muted">{s.messages?.length ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-foreground-muted">
              <tr>
                <th className="p-4 font-semibold">Document Name</th>
                <th className="p-4 font-semibold">Session</th>
                <th className="p-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {libraryDocs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-foreground-muted">
                    No documents found.
                  </td>
                </tr>
              ) : (
                libraryDocs.map(({ doc, sessionId, sessionTitle }) => (
                  <tr key={`${sessionId}-${doc.id}`} className="hover:bg-surface-muted">
                    <td className="flex items-center gap-2 p-4 font-medium text-foreground">
                      <FileIcon className="size-4 text-primary" aria-hidden />
                      {doc.name}
                    </td>
                    <td className="p-4 text-foreground-muted">{sessionTitle}</td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${doc.name}`}
                        disabled={updateSession.isPending}
                        onClick={() => handleDeleteDoc(sessionId, doc.id)}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessageSquare
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
    </div>
  )
}

function ListCard({
  title,
  icon: Icon,
  empty,
  children,
}: {
  title: string
  icon: typeof Clock
  empty: string
  children: React.ReactNode
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted p-6">
        <h3 className="flex items-center gap-2 font-bold text-foreground">
          <Icon className="size-4 text-foreground-muted" aria-hidden />
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {hasChildren ? (
          children
        ) : (
          <div className="p-6 text-center text-sm text-foreground-muted">{empty}</div>
        )}
      </div>
    </div>
  )
}

function SessionRow({
  title,
  meta,
  onClick,
}: {
  title: string
  meta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface-muted"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground-muted">
          <Clock className="size-3.5" aria-hidden />
          {meta}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-foreground-subtle" aria-hidden />
    </button>
  )
}

export default ResearchLanding
