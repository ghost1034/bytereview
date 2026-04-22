'use client'

import type { Editor } from '@tiptap/core'
import { BubbleMenu, FloatingMenu } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Play, RefreshCw, Square, Wand2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiClient, InkwiseBoundSource, InkwiseCitationStyle, InkwiseCitation, InkwiseSseEvent, InkwiseWritingAction } from '@/lib/api'
import { getInkwiseEditorTarget, type InkwiseEditorTarget, insertMarkdownIntoEditor } from '@/lib/inkwise-editor'
import { InkwiseMarkdownView } from '@/components/inkwise/markdown-view'
import { compareNaturalText } from '@/lib/utils'

type ToolAction = Exclude<InkwiseWritingAction, 'other'> | 'custom'
const DEFAULT_CUSTOM_INSTRUCTION = 'Improve clarity, keep meaning.'

const TOOL_CONFIG: Record<Exclude<ToolAction, 'custom'>, { label: string; instruction: string }> = {
  coherent: {
    label: 'Coherent',
    instruction: 'Make this more coherent by improving flow, transitions, and structure while preserving meaning.',
  },
  concise: {
    label: 'Concise',
    instruction: 'Make this more concise while preserving the key meaning and important details.',
  },
  detailed: {
    label: 'Detailed',
    instruction: 'Expand this with more relevant detail, specificity, and helpful context without adding filler.',
  },
  humanize: {
    label: 'Humanize',
    instruction: 'Make this sound more natural and human while preserving the underlying meaning.',
  },
}

function isPresetInstruction(value: string): boolean {
  return Object.values(TOOL_CONFIG).some((config) => config.instruction === value)
}

type GroundingState = {
  grounded: boolean
  evidenceCount: number
  retrievalRunId?: string | null
  fallback?: string | null
  evidence?: InkwiseCitation[]
}

export function InlineWritingTools({
  editor,
  documentId,
  boundSources,
  citationStyle,
}: {
  editor: Editor | null
  documentId: string
  boundSources: InkwiseBoundSource[]
  citationStyle: InkwiseCitationStyle
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputMd, setOutputMd] = useState('')
  const [outputWithCitations, setOutputWithCitations] = useState<string | null>(null)
  const [draftAction, setDraftAction] = useState<ToolAction | null>(null)
  const [lastAction, setLastAction] = useState<ToolAction | null>(null)
  const [instruction, setInstruction] = useState(DEFAULT_CUSTOM_INSTRUCTION)
  const [inserting, setInserting] = useState<null | 'replace' | 'after' | 'insert'>(null)
  const [sourceChecked, setSourceChecked] = useState<Record<string, boolean>>({})
  const [sourceSearch, setSourceSearch] = useState('')
  const [groundingState, setGroundingState] = useState<GroundingState | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const rangeRef = useRef<InkwiseEditorTarget | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sortedBoundSources = useMemo(() => {
    const items = [...boundSources]
    items.sort((left, right) => compareNaturalText(left.source.title, right.source.title))
    return items
  }, [boundSources])
  const readySources = useMemo(() => sortedBoundSources.filter((item) => item.grounded_chat_ready), [sortedBoundSources])
  const filteredBoundSources = useMemo(
    () => sortedBoundSources.filter((item) => matchesBoundSourceSearch(item, sourceSearch)),
    [sortedBoundSources, sourceSearch],
  )
  const selectedSourceIds = useMemo(
    () => readySources.filter((item) => sourceChecked[item.source.id] ?? true).map((item) => item.source.id),
    [readySources, sourceChecked],
  )

  useEffect(() => {
    if (!readySources.length) return
    setSourceChecked((prev) => {
      const next: Record<string, boolean> = {}
      for (const item of readySources) next[item.source.id] = prev[item.source.id] ?? true
      return next
    })
  }, [readySources])

  useEffect(() => {
    if (!editor) return
    const onSelection = () => {
      if (!busy) {
        clearRunState()
        setDraftAction(null)
        setPanelOpen(false)
        rangeRef.current = null
      }
    }
    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor, busy])

  function selectionTarget(currentEditor: Editor): InkwiseEditorTarget | null {
    return getInkwiseEditorTarget(currentEditor)
  }

  function activeTarget(): InkwiseEditorTarget | null {
    return editor ? selectionTarget(editor) : null
  }

  function preventEditorBlur(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  function clearRunState() {
    setError(null)
    setOutputMd('')
    setOutputWithCitations(null)
    setLastAction(null)
    setGroundingState(null)
    setAttemptId(null)
  }

  function openPanel() {
    const target = activeTarget()
    if (!target) return
    setPanelOpen(true)
    if (target.hasSelection) {
      setDraftAction(null)
    } else {
      setDraftAction('custom')
      if (draftAction !== 'custom' && isPresetInstruction(instruction)) setInstruction(DEFAULT_CUSTOM_INSTRUCTION)
    }
    rangeRef.current = target
  }

  function prepareAction(action: ToolAction) {
    const target = activeTarget()
    if (!target || busy) return

    clearRunState()
    setPanelOpen(true)
    setDraftAction(action)
    rangeRef.current = target

    if (action === 'custom') {
      setInstruction(draftAction === 'custom' || !isPresetInstruction(instruction) ? instruction : DEFAULT_CUSTOM_INSTRUCTION)
      return
    }

    setInstruction(TOOL_CONFIG[action].instruction)
  }

  async function run(action: ToolAction, resolvedInstruction: string) {
    if (!editor) return
    const selection = selectionTarget(editor)
    if (!selection) return
    if (!selection.hasSelection && action !== 'custom') return

    clearRunState()
    setBusy(true)
    setLastAction(action)
    setPanelOpen(true)
    rangeRef.current = selection

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await apiClient.streamInkwiseWritingTool(
        {
          action: action === 'custom' ? 'other' : action,
          document_id: documentId,
          source_ids: selectedSourceIds,
          selection_text: selection.hasSelection ? selection.text : null,
          surrounding_text: null,
          instruction: resolvedInstruction,
        },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            setOutputMd((current) => current + (event.data?.text ?? ''))
          }
          if (event.event === 'meta' && event.data?.error) {
            setError(event.data?.message || 'Writing tool failed')
          }
          if (event.event === 'meta' && typeof event.data?.grounded === 'boolean') {
            setGroundingState({
              grounded: Boolean(event.data.grounded),
              evidenceCount: Number(event.data?.evidence_count || 0),
              retrievalRunId: event.data?.retrieval_run_id ? String(event.data.retrieval_run_id) : null,
              fallback: event.data?.grounding_fallback || null,
              evidence: Array.isArray(event.data?.evidence) ? event.data.evidence : [],
            })
          }
          if ((event.event === 'meta' || event.event === 'done') && event.data?.attempt_id) {
            setAttemptId(String(event.data.attempt_id))
          }
          if (event.event === 'done' && event.data?.content_with_citations) {
            setOutputWithCitations(String(event.data.content_with_citations))
          }
          if (event.event === 'done' && Array.isArray(event.data?.citations) && event.data.citations.length) {
            setGroundingState((current) =>
              current
                ? {
                    ...current,
                    evidence: event.data.citations,
                    evidenceCount: event.data.citations.length,
                  }
                : current,
            )
          }
        },
        { signal: controller.signal },
      )
    } catch (err) {
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to run tool')
    } finally {
      setBusy(false)
    }
  }

  async function submitDraft() {
    if (!draftAction) return

    const resolvedInstruction = instruction.trim()
    if (!resolvedInstruction) return

    await run(draftAction, resolvedInstruction)
  }

  async function insert(mode: 'replace' | 'after' | 'insert') {
    if (!editor || !rangeRef.current) return
    const markdown = (outputMd || '').trim()
    if (!markdown) return

    setInserting(mode)
    try {
      await insertMarkdownIntoEditor({
        editor,
        markdown,
        mode,
        target: rangeRef.current,
        citationAnchor: groundingState?.grounded && groundingState.evidence?.length
          ? {
              sourceKind: 'writing_tool',
              citations: groundingState.evidence,
              citationStyle,
              attemptId,
              retrievalRunId: groundingState.retrievalRunId,
              contentWithCitations: outputWithCitations || outputMd,
            }
          : null,
      })
    } finally {
      setInserting(null)
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  function closePanel() {
    clearRunState()
    setDraftAction(null)
    setPanelOpen(false)
    rangeRef.current = null
  }

  async function retryAttempt() {
    if (!attemptId) return

    setError(null)
    setBusy(true)
    setOutputMd('')
    setOutputWithCitations(null)
    setGroundingState(null)
    setPanelOpen(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await apiClient.streamInkwiseRetryWritingTool(
        attemptId,
        { fresh_retrieval: true },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            setOutputMd((current) => current + (event.data?.text ?? ''))
          }
          if (event.event === 'meta' && event.data?.error) {
            setError(event.data?.message || 'Writing tool failed')
          }
          if (event.event === 'meta' && typeof event.data?.grounded === 'boolean') {
            setGroundingState({
              grounded: Boolean(event.data.grounded),
              evidenceCount: Number(event.data?.evidence_count || 0),
              retrievalRunId: event.data?.retrieval_run_id ? String(event.data.retrieval_run_id) : null,
              fallback: event.data?.grounding_fallback || null,
              evidence: Array.isArray(event.data?.evidence) ? event.data.evidence : [],
            })
          }
          if ((event.event === 'meta' || event.event === 'done') && event.data?.attempt_id) {
            setAttemptId(String(event.data.attempt_id))
          }
          if (event.event === 'done' && event.data?.content_with_citations) {
            setOutputWithCitations(String(event.data.content_with_citations))
          }
          if (event.event === 'done' && Array.isArray(event.data?.citations) && event.data.citations.length) {
            setGroundingState((current) =>
              current
                ? {
                    ...current,
                    evidence: event.data.citations,
                    evidenceCount: event.data.citations.length,
                  }
                : current,
            )
          }
        },
        { signal: controller.signal },
      )
    } catch (err) {
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to retry tool')
    } finally {
      setBusy(false)
    }
  }

  if (!editor) return null

  const currentTarget = activeTarget()
  const hasSelection = Boolean(currentTarget?.hasSelection)

  const panel = (
    <div className="flex max-h-[min(80vh,42rem)] w-[min(32rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border bg-white/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {hasSelection ? (
                <>
                  <Button size="sm" variant={draftAction === 'coherent' ? 'default' : 'outline'} onMouseDown={preventEditorBlur} onClick={() => prepareAction('coherent')} disabled={busy}>Coherent</Button>
                  <Button size="sm" variant={draftAction === 'concise' ? 'default' : 'outline'} onMouseDown={preventEditorBlur} onClick={() => prepareAction('concise')} disabled={busy}>Concise</Button>
                  <Button size="sm" variant={draftAction === 'detailed' ? 'default' : 'outline'} onMouseDown={preventEditorBlur} onClick={() => prepareAction('detailed')} disabled={busy}>Detailed</Button>
                  <Button size="sm" variant={draftAction === 'humanize' ? 'default' : 'outline'} onMouseDown={preventEditorBlur} onClick={() => prepareAction('humanize')} disabled={busy}>Humanize</Button>
                  <Button size="sm" variant={draftAction === 'custom' ? 'default' : 'outline'} onMouseDown={preventEditorBlur} onClick={() => prepareAction('custom')} disabled={busy}>Custom</Button>
                </>
              ) : (
            <div className="text-sm font-medium text-slate-900">Write with AI</div>
          )}
        </div>
        <div>
          {busy ? <Button size="sm" variant="outline" className="h-8 w-8 p-0" onMouseDown={preventEditorBlur} onClick={stop} aria-label="Stop"><Square className="h-4 w-4 fill-red-500 text-red-500" /></Button> : outputMd || error ? <Button size="sm" variant="outline" className="h-8 w-8 p-0" onMouseDown={preventEditorBlur} onClick={closePanel} aria-label="Close"><X className="h-4 w-4" /></Button> : null}
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="rounded-xl border bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Sources</div>
              <div className="text-xs text-slate-500">
                {readySources.length
                  ? `${selectedSourceIds.length} of ${readySources.length} ready sources attached`
                  : boundSources.length
                    ? 'No ready sources attached yet'
                    : 'No sources bound to this document'}
              </div>
            </div>
            {readySources.length ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onMouseDown={preventEditorBlur}
                  onClick={() => setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, true])))}
                  disabled={busy}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onMouseDown={preventEditorBlur}
                  onClick={() => setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, false])))}
                  disabled={busy}
                >
                  None
                </Button>
              </div>
            ) : null}
          </div>

          {sortedBoundSources.length ? (
            <>
              <Input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder="Search attached sources"
                className="mt-3 bg-white"
                onMouseDown={preventEditorBlur}
              />
              <div className="mt-3 grid max-h-36 gap-2 overflow-auto">
                {filteredBoundSources.map((item) => (
                  <label
                    key={item.binding_id}
                    onMouseDown={preventEditorBlur}
                    className={`flex items-center gap-3 text-sm ${item.grounded_chat_ready ? 'text-slate-700' : 'text-slate-400'}`}
                  >
                    <Checkbox
                      checked={sourceChecked[item.source.id] ?? item.grounded_chat_ready}
                      disabled={!item.grounded_chat_ready || busy}
                      onMouseDown={preventEditorBlur}
                      onCheckedChange={(checked) => {
                        setSourceChecked((prev) => ({ ...prev, [item.source.id]: Boolean(checked) }))
                      }}
                    />
                    <span>{item.source.title}</span>
                    {!item.grounded_chat_ready ? <span className="text-xs">({item.grounded_chat_reason || 'Not ready'})</span> : null}
                  </label>
                ))}
                {!filteredBoundSources.length ? (
                  <div className="text-sm text-slate-500">No attached sources match that search.</div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {draftAction ? (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="inkwise-tool-prompt">Prompt</Label>
                <div className="mt-1 text-xs text-slate-500">Review and edit this instruction before sending it to Inkwise.</div>
              </div>
              <Button size="sm" onMouseDown={preventEditorBlur} onClick={() => submitDraft()} disabled={busy || !instruction.trim()}>
                <Play className="mr-1.5 h-4 w-4" />
                Send
              </Button>
            </div>
            <Textarea
              id="inkwise-tool-prompt"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={hasSelection ? 'e.g. rewrite in a persuasive tone' : 'e.g. draft a concise transition sentence'}
              className="min-h-[108px] bg-white"
              onMouseDown={preventEditorBlur}
            />
          </div>
        ) : hasSelection ? (
          <div className="rounded-xl border border-dashed bg-slate-50 p-3 text-sm text-slate-600">
            Choose a tool to preview its prompt, then edit and send when ready.
          </div>
        ) : null}

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {busy || outputMd ? (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-sm font-medium text-slate-900">
              {busy ? 'Writing...' : lastAction ? `Result (${lastAction === 'custom' ? 'Custom' : TOOL_CONFIG[lastAction].label})` : 'Result'}
            </div>
            {groundingState ? (
              <div className="mt-1 text-xs text-slate-500">
                {groundingState.grounded
                  ? `Grounded to ${groundingState.evidenceCount} evidence ${groundingState.evidenceCount === 1 ? 'segment' : 'segments'}`
                  : groundingState.fallback === 'no_evidence'
                    ? 'No matching evidence found in the selected sources'
                    : groundingState.fallback === 'retrieval_error'
                      ? 'Grounding fell back to an ungrounded rewrite'
                      : 'Running without grounded evidence'}
              </div>
            ) : null}
            <div className="mt-3 max-h-56 overflow-auto text-sm text-slate-700">
              {outputMd ? <InkwiseMarkdownView markdown={outputWithCitations || outputMd} citations={groundingState?.evidence} renderInlineCitations className="prose prose-sm max-w-none" /> : <div className="text-slate-400">...</div>}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onMouseDown={preventEditorBlur} onClick={() => retryAttempt()} disabled={!attemptId || busy} aria-label="Retry">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {rangeRef.current?.hasSelection ? (
                <>
                  <Button size="sm" variant="outline" onMouseDown={preventEditorBlur} onClick={() => insert('after')} disabled={!outputMd || inserting === 'after'}>
                    {inserting === 'after' ? 'Inserting...' : 'Insert after'}
                  </Button>
                  <Button size="sm" onMouseDown={preventEditorBlur} onClick={() => insert('replace')} disabled={!outputMd || inserting === 'replace'}>
                    {inserting === 'replace' ? 'Replacing...' : 'Replace selection'}
                  </Button>
                </>
              ) : (
                <Button size="sm" onMouseDown={preventEditorBlur} onClick={() => insert('insert')} disabled={!outputMd || inserting === 'insert'}>
                  {inserting === 'insert' ? 'Inserting...' : 'Insert'}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onMouseDown={preventEditorBlur} onClick={() => navigator.clipboard?.writeText(outputMd || '')} disabled={!outputMd} aria-label="Copy">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  const icon = (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={openPanel}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border bg-white/95 text-slate-700 shadow-2xl backdrop-blur transition hover:border-emerald-300 hover:text-emerald-700"
      aria-label="Open inline writing tools"
    >
      <Wand2 className="h-4 w-4" />
    </button>
  )

  return (
    <>
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => Boolean(editor && selectionTarget(editor)?.hasSelection)}
        tippyOptions={{
          duration: 120,
          maxWidth: 560,
          placement: 'bottom',
          appendTo: () => document.body,
          interactive: true,
          popperOptions: {
            modifiers: [
              { name: 'flip', options: { fallbackPlacements: ['top', 'bottom'] } },
              { name: 'preventOverflow', options: { padding: 8 } },
            ],
          },
        }}
      >
        {panelOpen && hasSelection ? panel : icon}
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        shouldShow={({ editor }) => Boolean(editor?.isFocused && selectionTarget(editor) && !selectionTarget(editor)?.hasSelection)}
        tippyOptions={{
          duration: 120,
          maxWidth: 560,
          placement: 'bottom',
          appendTo: () => document.body,
          interactive: true,
          popperOptions: {
            modifiers: [
              { name: 'flip', options: { fallbackPlacements: ['top', 'bottom'] } },
              { name: 'preventOverflow', options: { padding: 8 } },
            ],
          },
        }}
      >
        {panelOpen && !hasSelection ? panel : icon}
      </FloatingMenu>
    </>
  )
}

function matchesBoundSourceSearch(source: InkwiseBoundSource, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    source.source.title,
    source.source.original_path,
    source.source.source_url,
    source.source.original_filename,
    source.source.status,
    source.grounded_chat_reason,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery))
}
