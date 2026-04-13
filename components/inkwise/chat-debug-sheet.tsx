'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  apiClient,
  InkwiseCitation,
  InkwiseDebugTimelineEntry,
  InkwiseGenerationAttemptDetail,
  InkwiseRetrievalRunDetail,
} from '@/lib/api'

export function InkwiseChatDebugSheet({
  open,
  onOpenChange,
  attemptId,
  retrievalRunId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  attemptId?: string | null
  retrievalRunId?: string | null
}) {
  const attemptQuery = useQuery<InkwiseGenerationAttemptDetail>({
    queryKey: ['inkwise', 'chat-attempt', attemptId],
    queryFn: () => apiClient.getInkwiseChatAttempt(String(attemptId)),
    enabled: open && Boolean(attemptId),
    staleTime: 30_000,
  })

  const retrievalQuery = useQuery<InkwiseRetrievalRunDetail>({
    queryKey: ['inkwise', 'retrieval-run', retrievalRunId],
    queryFn: () => apiClient.getInkwiseRetrievalRun(String(retrievalRunId)),
    enabled: open && Boolean(retrievalRunId),
    staleTime: 30_000,
  })

  const debugTimeline = useMemo(() => attemptQuery.data?.debug_timeline ?? [], [attemptQuery.data])
  const retrievalMeta = retrievalQuery.data?.run.meta ?? null
  const searchAttempts = Array.isArray(retrievalMeta?.search_attempts) ? retrievalMeta.search_attempts : []
  const queryRewrite = isRecord(retrievalMeta?.query_rewrite) ? retrievalMeta.query_rewrite : null
  const rerank = isRecord(retrievalMeta?.rerank) ? retrievalMeta.rerank : null
  const loading = attemptQuery.isLoading || retrievalQuery.isLoading
  const error = attemptQuery.error || retrievalQuery.error

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden sm:max-w-3xl">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Chat Debug</SheetTitle>
            <SheetDescription>Backend timing and retrieval details for this assistant answer.</SheetDescription>
          </SheetHeader>

          <ScrollArea className="mt-4 flex-1 pr-2">
            <div className="space-y-4 pb-8">
              {!attemptId && !retrievalRunId ? (
                <EmptyCard message="No debug identifiers were saved for this message." />
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center rounded-2xl border bg-white p-8 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading backend debug details...
                </div>
              ) : null}

              {error ? (
                <EmptyCard message={error instanceof Error ? error.message : 'Could not load debug details.'} tone="error" />
              ) : null}

              {attemptQuery.data ? (
                <section className="rounded-2xl border bg-white p-4">
                  <SectionTitle title="Attempt" />
                  <KeyValueGrid
                    items={[
                      ['Attempt ID', attemptQuery.data.attempt.id],
                      ['Status', attemptQuery.data.attempt.status],
                      ['Provider', attemptQuery.data.attempt.provider || ''],
                      ['Model', attemptQuery.data.attempt.model || ''],
                      ['Created', formatDateTime(attemptQuery.data.attempt.created_at)],
                      ['Completed', formatDateTime(attemptQuery.data.attempt.completed_at)],
                    ]}
                  />
                </section>
              ) : null}

              {debugTimeline.length ? (
                <section className="rounded-2xl border bg-white p-4">
                  <SectionTitle title="Timeline" />
                  <div className="mt-3 space-y-3">
                    {debugTimeline.map((entry, index) => (
                      <TimelineRow key={`${entry.stage}-${index}`} entry={entry} />
                    ))}
                  </div>
                </section>
              ) : attemptId && !loading && !error ? (
                <EmptyCard message="No debug timeline was recorded for this attempt." />
              ) : null}

              {retrievalQuery.data ? (
                <>
                  <section className="rounded-2xl border bg-white p-4">
                    <SectionTitle title="Retrieval" />
                    <KeyValueGrid
                      items={[
                        ['Retrieval run', retrievalQuery.data.run.id],
                        ['Strategy', retrievalQuery.data.run.strategy_version],
                        ['Created', formatDateTime(retrievalQuery.data.run.created_at)],
                        ['Evidence count', String(retrievalQuery.data.evidence.length)],
                        ['Bound source count', String(retrievalQuery.data.run.bound_source_ids.length)],
                        ['Total duration', formatDuration(retrievalMeta?.total_duration_ms ?? retrievalMeta?.retrieval_duration_ms)],
                      ]}
                    />
                    <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Query</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{retrievalQuery.data.run.query}</div>
                    </div>
                  </section>

                  {queryRewrite ? (
                    <section className="rounded-2xl border bg-white p-4">
                      <SectionTitle title="Query Rewrite" />
                      <KeyValueGrid
                        items={[
                          ['Enabled', formatBoolean(queryRewrite.enabled)],
                          ['Triggered', formatBoolean(queryRewrite.triggered)],
                          ['Duration', formatDuration(queryRewrite.duration_ms)],
                          ['Standalone question', formatValue(queryRewrite.standalone_question)],
                          ['FTS query', formatValue(queryRewrite.fts_query)],
                        ]}
                      />
                    </section>
                  ) : null}

                  {searchAttempts.length ? (
                    <section className="rounded-2xl border bg-white p-4">
                      <SectionTitle title="Search Attempts" />
                      <div className="mt-3 space-y-3">
                        {searchAttempts.map((attempt, index) => (
                          <div key={index} className="rounded-xl border bg-slate-50 p-3">
                            <div className="text-sm font-medium text-slate-900">Attempt {attempt.attempt_index || index + 1}</div>
                            <KeyValueGrid
                              items={[
                                ['Vector query', formatValue(attempt.vector_query)],
                                ['Lexical query', formatValue(attempt.lexical_query)],
                                ['Embedding', formatDuration(attempt.embedding_duration_ms)],
                                ['Vector search', formatDuration(attempt.vector_search_duration_ms)],
                                ['Lexical search', formatDuration(attempt.lexical_search_duration_ms)],
                                ['Merge', formatDuration(attempt.merge_duration_ms)],
                                ['Attempt total', formatDuration(attempt.duration_ms)],
                                ['Vector candidates', formatValue(attempt.vector_count)],
                                ['Lexical candidates', formatValue(attempt.lexical_count)],
                                ['Merged candidates', formatValue(attempt.merged_count)],
                                ['Prompt tokens', formatValue(attempt.prompt_token_count)],
                                ['Embedding truncated', formatBoolean(attempt.truncated)],
                              ]}
                              className="mt-3"
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {rerank ? (
                    <section className="rounded-2xl border bg-white p-4">
                      <SectionTitle title="Rerank" />
                      <KeyValueGrid
                        items={[
                          ['Enabled', formatBoolean(rerank.enabled)],
                          ['Triggered', formatBoolean(rerank.triggered)],
                          ['Duration', formatDuration(rerank.duration_ms)],
                          ['Candidate count', formatValue(rerank.candidate_count)],
                          ['Selected IDs', Array.isArray(rerank.selected_candidate_ids) ? rerank.selected_candidate_ids.join(', ') : ''],
                        ]}
                      />
                    </section>
                  ) : null}

                  <section className="rounded-2xl border bg-white p-4">
                    <SectionTitle title="Evidence" />
                    <div className="mt-3 space-y-3">
                      {retrievalQuery.data.evidence.map((item, index) => (
                        <EvidenceRow key={`${item.evidence_id || index}-${index}`} item={item} />
                      ))}
                    </div>
                  </section>
                </>
              ) : retrievalRunId && !loading && !error ? (
                <EmptyCard message="No retrieval run details were found for this answer." />
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function TimelineRow({ entry }: { entry: InkwiseDebugTimelineEntry }) {
  const detailItems = Object.entries(entry.details || {}).filter(([, value]) => hasRenderableValue(value))
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-900">{entry.label}</div>
          <div className="mt-1 text-xs text-slate-500">{entry.stage}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div className={entry.status === 'failed' ? 'text-red-600' : entry.status === 'skipped' ? 'text-amber-600' : 'text-slate-500'}>{entry.status}</div>
          <div>{formatDuration(entry.duration_ms)}</div>
        </div>
      </div>
      {detailItems.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {detailItems.map(([label, value]) => (
            <KeyValueCell key={label} label={humanizeKey(label)} value={formatValue(value)} />
          ))}
        </div>
      ) : null}
      {entry.error ? <div className="mt-3 text-sm text-red-600">{entry.error}</div> : null}
    </div>
  )
}

function EvidenceRow({ item }: { item: InkwiseCitation }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-900">{item.evidence_id || 'Evidence'}</div>
        <div className="text-xs text-slate-500">{item.page_number ? `p.${item.page_number}` : item.segment_title || 'segment'}</div>
      </div>
      <div className="mt-1 text-sm text-slate-700">{item.source_title || 'Untitled source'}</div>
      {item.excerpt ? <div className="mt-3 text-sm text-slate-600">{item.excerpt}</div> : null}
      {item.score != null ? <div className="mt-3 text-xs text-slate-500">Score: {Number(item.score).toFixed(4)}</div> : null}
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
}

function EmptyCard({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'error' }) {
  return (
    <div className={`rounded-2xl border p-4 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'bg-white text-slate-500'}`}>
      {message}
    </div>
  )
}

function KeyValueGrid({ items, className }: { items: Array<[string, string]>; className?: string }) {
  const filtered = items.filter(([, value]) => Boolean(value))
  if (!filtered.length) return null
  return (
    <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${className || ''}`.trim()}>
      {filtered.map(([label, value]) => (
        <KeyValueCell key={label} label={label} value={value} />
      ))}
    </div>
  )
}

function KeyValueCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm text-slate-700">{value}</div>
    </div>
  )
}

function formatDuration(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return `${Math.max(0, Math.round(value))} ms`
}

function formatDateTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatBoolean(value: unknown): string {
  if (typeof value !== 'boolean') return ''
  return value ? 'Yes' : 'No'
}

function formatValue(value: unknown): string {
  if (!hasRenderableValue(value)) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).filter(Boolean).join(', ')
  if (isRecord(value)) return JSON.stringify(value)
  return ''
}

function hasRenderableValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return false
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
