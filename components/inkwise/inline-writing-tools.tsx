'use client'

import { posToDOMRect, type Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { BubbleMenu, FloatingMenu } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Copy, Library, Loader2, RotateCcw, Sparkles, Square, Wand2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { apiClient, InkwiseBoundSource, InkwiseCitationStyle, InkwiseCitation, InkwiseSseEvent, InkwiseWritingAction } from '@/lib/api'
import { getInkwiseEditorTarget, type InkwiseEditorTarget, insertMarkdownIntoEditor } from '@/lib/inkwise-editor'
import { assistantMarkdownClassName } from '@/lib/inkwise-chat'
import { clearWritingSelectionHighlight, setWritingSelectionHighlight } from '@/components/inkwise/editor-writing-selection'
import { ActionIcon } from '@/components/inkwise/action-icon'
import { InkwiseMarkdownView } from '@/components/inkwise/markdown-view'
import { cn, compareNaturalText } from '@/lib/utils'

type ToolAction = Exclude<InkwiseWritingAction, 'other'> | 'custom'
const DEFAULT_CUSTOM_INSTRUCTION = ''
const MAX_COMPOSER_HEIGHT_PX = 160
const TOOL_PILL_ORDER: ToolAction[] = ['coherent', 'concise', 'detailed', 'humanize', 'custom']

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
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const rangeRef = useRef<InkwiseEditorTarget | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastClickedSourceIdRef = useRef<string | null>(null)
  // The tiptap menu plugins register once and capture the first render's closures,
  // so anything read inside shouldShow/tippyOptions must live in a ref.
  const panelOpenRef = useRef(false)
  const editorRef = useRef(editor)
  editorRef.current = editor

  const setPanelOpenTracked = useCallback((open: boolean) => {
    panelOpenRef.current = open
    setPanelOpen(open)
  }, [])

  // While the panel is open, anchor it to the stored target range instead of
  // the live selection: programmatic transactions (autosave content sync,
  // collaborative updates) can move or reset the selection, and the menu
  // plugins would otherwise reposition the panel to wherever it landed.
  const menuReferenceClientRect = useCallback(() => {
    const view = editorRef.current?.view
    if (!view) return new DOMRect()
    const target = panelOpenRef.current ? rangeRef.current : null
    const max = view.state.doc.content.size
    const from = Math.min(target?.from ?? view.state.selection.from, max)
    const to = Math.min(target?.to ?? view.state.selection.to, max)
    return posToDOMRect(view, from, to)
  }, [])

  // Auto-grow the prompt composer as the instruction changes (typed input or preset population).
  useEffect(() => {
    const el = promptRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`
  }, [instruction, draftAction, panelOpen])

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
    return () => {
      clearWritingSelectionHighlight(editor)
    }
  }, [editor])

  function selectionTarget(currentEditor: Editor): InkwiseEditorTarget | null {
    return getInkwiseEditorTarget(currentEditor)
  }

  function activeTarget(): InkwiseEditorTarget | null {
    return editor ? selectionTarget(editor) : null
  }

  function preventEditorBlur(event: { preventDefault: () => void }) {
    event.preventDefault()
  }

  function toggleSource(sourceId: string, selectRange: boolean) {
    setSourceChecked((prev) => {
      const nextSelected = !(prev[sourceId] ?? true)
      const next = { ...prev, [sourceId]: nextSelected }
      const anchorId = lastClickedSourceIdRef.current

      if (selectRange && anchorId) {
        const anchorIndex = filteredBoundSources.findIndex((item) => item.source.id === anchorId)
        const sourceIndex = filteredBoundSources.findIndex((item) => item.source.id === sourceId)
        if (anchorIndex >= 0 && sourceIndex >= 0) {
          const start = Math.min(anchorIndex, sourceIndex)
          const end = Math.max(anchorIndex, sourceIndex)
          for (const item of filteredBoundSources.slice(start, end + 1)) {
            if (item.grounded_chat_ready) next[item.source.id] = nextSelected
          }
        }
      }

      return next
    })
    lastClickedSourceIdRef.current = sourceId
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
    setPanelOpenTracked(true)
    if (target.hasSelection) {
      setDraftAction(null)
    } else {
      setDraftAction('custom')
      if (draftAction !== 'custom' && isPresetInstruction(instruction)) setInstruction(DEFAULT_CUSTOM_INSTRUCTION)
    }
    rangeRef.current = target
    if (target.hasSelection) {
      setWritingSelectionHighlight(editor, target)
    } else {
      clearWritingSelectionHighlight(editor)
    }
  }

  function prepareAction(action: ToolAction) {
    const target = activeTarget()
    if (!target || busy) return

    clearRunState()
    setPanelOpenTracked(true)
    setDraftAction(action)
    rangeRef.current = target
    if (target.hasSelection) setWritingSelectionHighlight(editor, target)

    if (action === 'custom') {
      setInstruction(draftAction === 'custom' || !isPresetInstruction(instruction) ? instruction : DEFAULT_CUSTOM_INSTRUCTION)
      return
    }

    setInstruction(TOOL_CONFIG[action].instruction)
  }

  async function run(action: ToolAction, resolvedInstruction: string) {
    if (!editor) return
    const selection = rangeRef.current ?? selectionTarget(editor)
    if (!selection) return
    if (!selection.hasSelection && action !== 'custom') return

    clearRunState()
    setBusy(true)
    setLastAction(action)
    setPanelOpenTracked(true)
    rangeRef.current = selection
    if (selection.hasSelection) setWritingSelectionHighlight(editor, selection)

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
      const inserted = await insertMarkdownIntoEditor({
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
      if (inserted) closePanel()
    } finally {
      setInserting(null)
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  const closePanel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setError(null)
    setOutputMd('')
    setOutputWithCitations(null)
    setLastAction(null)
    setGroundingState(null)
    setAttemptId(null)
    setDraftAction(null)
    setPanelOpenTracked(false)
    rangeRef.current = null
    clearWritingSelectionHighlight(editor)
  }, [editor, setPanelOpenTracked])

  useEffect(() => {
    if (!panelOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closePanel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [panelOpen, closePanel])

  // Close only on an explicit click/tap outside the panel — never on editor
  // selection changes, which also fire for programmatic transactions (autosave
  // content sync, collaborative updates) while the user is mid-composition.
  useEffect(() => {
    if (!panelOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      closePanel()
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [panelOpen, closePanel])

  // Programmatic doc replacements (autosave content sync) collapse the mapped
  // highlight decoration; re-apply it from the stored target while the panel
  // is open. User edits can't land here: clicking back into the editor closes
  // the panel first.
  useEffect(() => {
    if (!editor || !panelOpen) return

    function reapplyHighlight({ transaction }: { transaction: Transaction }) {
      if (!transaction.docChanged) return
      const target = rangeRef.current
      if (target?.hasSelection) setWritingSelectionHighlight(editor, target)
    }

    editor.on('transaction', reapplyHighlight)
    return () => {
      editor.off('transaction', reapplyHighlight)
    }
  }, [editor, panelOpen])

  // Popper only repositions on scroll/resize, so a panel that grows while
  // output streams in can extend past the viewport edge. Re-run positioning
  // whenever the panel's size changes.
  useEffect(() => {
    if (!panelOpen) return
    const panelEl = panelRef.current
    if (!panelEl) return

    const tippyRoot = panelEl.closest('[data-tippy-root]') as
      | (Element & { _tippy?: { popperInstance?: { update: () => void } | null } })
      | null
    if (!tippyRoot) return

    const observer = new ResizeObserver(() => {
      tippyRoot._tippy?.popperInstance?.update()
    })
    observer.observe(panelEl)
    return () => observer.disconnect()
  }, [panelOpen])

  function shouldShowBubbleWritingTools(currentEditor: Editor | null): boolean {
    if (!currentEditor) return false
    return Boolean(selectionTarget(currentEditor)?.hasSelection || (panelOpenRef.current && rangeRef.current?.hasSelection))
  }

  function shouldShowFloatingWritingTools(currentEditor: Editor | null): boolean {
    if (!currentEditor) return false
    const currentTarget = selectionTarget(currentEditor)
    return Boolean(
      (currentEditor.isFocused && currentTarget && !currentTarget.hasSelection) ||
        (panelOpenRef.current && rangeRef.current && !rangeRef.current.hasSelection),
    )
  }

  async function retryAttempt() {
    if (!attemptId) return

    setError(null)
    setBusy(true)
    setOutputMd('')
    setOutputWithCitations(null)
    setGroundingState(null)
    setPanelOpenTracked(true)

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
  const visibleTarget = panelOpen && rangeRef.current ? rangeRef.current : currentTarget
  const hasSelection = Boolean(visibleTarget?.hasSelection)

  const panel = (
    <div
      ref={panelRef}
      className="flex max-h-[min(86vh,50rem)] w-[min(44rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          {hasSelection ? (
            TOOL_PILL_ORDER.map((action) => (
              <button
                key={action}
                type="button"
                onMouseDown={preventEditorBlur}
                onClick={() => prepareAction(action)}
                disabled={busy}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50',
                  draftAction === action
                    ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-700'
                    : 'border-border bg-card text-foreground-muted hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700',
                )}
              >
                {action === 'custom' ? 'Custom' : TOOL_CONFIG[action].label}
              </button>
            ))
          ) : (
            <span className="text-sm font-medium text-foreground">Write with AI</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {busy ? (
            <button
              type="button"
              onMouseDown={preventEditorBlur}
              onClick={stop}
              aria-label="Stop"
              className="rounded-md p-1.5 transition-colors hover:bg-surface-muted"
            >
              <Square className="h-3.5 w-3.5 fill-destructive text-destructive" />
            </button>
          ) : null}
          <ActionIcon icon={X} label="Close" onClick={closePanel} onMouseDown={preventEditorBlur} />
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
        <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onMouseDown={preventEditorBlur}
              className="flex w-full items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground-muted transition-colors hover:border-emerald-300 hover:text-emerald-700"
            >
              <Library className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {readySources.length
                  ? `${selectedSourceIds.length} of ${readySources.length} sources`
                  : boundSources.length
                    ? 'No ready sources'
                    : 'No sources bound'}
              </span>
              <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform', sourcesOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-muted/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-foreground">Sources</div>
                {readySources.length ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onMouseDown={preventEditorBlur}
                      onClick={() => {
                        lastClickedSourceIdRef.current = null
                        setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, true])))
                      }}
                      disabled={busy}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onMouseDown={preventEditorBlur}
                      onClick={() => {
                        lastClickedSourceIdRef.current = null
                        setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, false])))
                      }}
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
                    className="h-8 bg-card text-sm"
                  />
                  <div className="grid max-h-36 gap-1.5 overflow-auto pr-1">
                    {filteredBoundSources.map((item) => {
                      const selected = sourceChecked[item.source.id] ?? item.grounded_chat_ready
                      return (
                        <button
                          key={item.binding_id}
                          type="button"
                          aria-pressed={selected}
                          disabled={!item.grounded_chat_ready || busy}
                          onMouseDown={preventEditorBlur}
                          onClick={(event) => toggleSource(item.source.id, event.shiftKey)}
                          className={cn(
                            'flex w-full select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                            selected
                              ? 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/80'
                              : item.grounded_chat_ready
                                ? 'text-foreground hover:bg-surface-muted'
                                : 'cursor-not-allowed text-foreground-subtle',
                          )}
                        >
                          <span className="truncate">{item.source.title}</span>
                          {!item.grounded_chat_ready ? (
                            <span className="ml-auto shrink-0 text-[10px]">{item.grounded_chat_reason || 'Not ready'}</span>
                          ) : null}
                        </button>
                      )
                    })}
                    {!filteredBoundSources.length ? (
                      <div className="px-1.5 py-2 text-xs text-foreground-muted">No attached sources match that search.</div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="text-xs text-foreground-muted">Bind references from the References tab to ground writing tools.</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {draftAction ? (
          <div className="relative">
            <Textarea
              ref={promptRef}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (!busy && instruction.trim()) void submitDraft()
                }
              }}
              placeholder={hasSelection ? 'e.g. rewrite in a persuasive tone' : 'e.g. draft a concise transition sentence'}
              rows={1}
              className="max-h-40 min-h-[44px] resize-none rounded-xl bg-card pr-12"
            />
            <Button
              size="icon"
              onMouseDown={preventEditorBlur}
              onClick={() => submitDraft()}
              disabled={busy || !instruction.trim()}
              className="absolute bottom-2 right-2 h-8 w-8 rounded-lg"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        ) : hasSelection ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-sm text-foreground-muted">
            Choose a tool to preview its prompt, then edit and send when ready.
          </div>
        ) : null}

        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        {busy || outputMd ? (
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-3 w-3" />
              </div>
              <span className="text-sm font-medium text-foreground">
                {busy ? 'Writing...' : lastAction ? `Result (${lastAction === 'custom' ? 'Custom' : TOOL_CONFIG[lastAction].label})` : 'Result'}
              </span>
            </div>
            {groundingState ? (
              <div className="mt-1 text-xs text-foreground-muted">
                {groundingState.grounded
                  ? `Grounded to ${groundingState.evidenceCount} evidence ${groundingState.evidenceCount === 1 ? 'segment' : 'segments'}`
                  : groundingState.fallback === 'no_evidence'
                    ? 'No matching evidence found in the selected sources'
                    : groundingState.fallback === 'retrieval_error'
                      ? 'Grounding fell back to an ungrounded rewrite'
                      : 'Running without grounded evidence'}
              </div>
            ) : null}
            <div className="mt-3 max-h-72 overflow-auto text-sm">
              {outputMd ? (
                <InkwiseMarkdownView
                  markdown={outputWithCitations || outputMd}
                  citations={groundingState?.evidence}
                  renderInlineCitations
                  className={assistantMarkdownClassName}
                />
              ) : (
                <div className="flex gap-1 py-1.5" aria-label="Writing">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.4s]" />
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <ActionIcon
                icon={RotateCcw}
                label="Retry"
                onClick={() => void retryAttempt()}
                onMouseDown={preventEditorBlur}
                disabled={!attemptId || busy}
              />
              {rangeRef.current?.hasSelection ? (
                <>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg" onMouseDown={preventEditorBlur} onClick={() => insert('after')} disabled={!outputMd || inserting === 'after'}>
                    {inserting === 'after' ? 'Inserting...' : 'Insert after'}
                  </Button>
                  <Button size="sm" className="h-8 rounded-lg" onMouseDown={preventEditorBlur} onClick={() => insert('replace')} disabled={!outputMd || inserting === 'replace'}>
                    {inserting === 'replace' ? 'Replacing...' : 'Replace selection'}
                  </Button>
                </>
              ) : (
                <Button size="sm" className="h-8 rounded-lg" onMouseDown={preventEditorBlur} onClick={() => insert('insert')} disabled={!outputMd || inserting === 'insert'}>
                  {inserting === 'insert' ? 'Inserting...' : 'Insert'}
                </Button>
              )}
              <ActionIcon
                icon={Copy}
                label="Copy"
                onClick={() => navigator.clipboard?.writeText(outputMd || '')}
                onMouseDown={preventEditorBlur}
                disabled={!outputMd}
              />
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground-muted shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
      aria-label="Open inline writing tools"
    >
      <Wand2 className="h-4 w-4" />
    </button>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => shouldShowBubbleWritingTools(editor)}
        tippyOptions={{
          duration: 120,
          maxWidth: 736,
          placement: 'bottom',
          appendTo: () => document.body,
          interactive: true,
          // The menu plugin hides the tippy directly on editor blur; keep the
          // panel up until it is dismissed explicitly (close button, Escape,
          // or a click outside).
          onHide: () => (panelOpenRef.current ? false : undefined),
          getReferenceClientRect: menuReferenceClientRect,
          popperOptions: {
            modifiers: [
              { name: 'flip', options: { fallbackPlacements: ['top', 'bottom'] } },
              // altAxis + tether keep the panel fully inside the viewport even
              // when it fits neither below nor above the selection (it may then
              // overlap the selection, which beats being clipped off screen).
              { name: 'preventOverflow', options: { padding: 8, altAxis: true, tether: false } },
            ],
          },
        }}
      >
        {panelOpen && hasSelection ? panel : icon}
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        shouldShow={({ editor }) => shouldShowFloatingWritingTools(editor)}
        tippyOptions={{
          duration: 120,
          maxWidth: 736,
          placement: 'bottom',
          appendTo: () => document.body,
          interactive: true,
          onHide: () => (panelOpenRef.current ? false : undefined),
          getReferenceClientRect: menuReferenceClientRect,
          popperOptions: {
            modifiers: [
              { name: 'flip', options: { fallbackPlacements: ['top', 'bottom'] } },
              { name: 'preventOverflow', options: { padding: 8, altAxis: true, tether: false } },
            ],
          },
        }}
      >
        {panelOpen && !hasSelection ? panel : icon}
      </FloatingMenu>
    </TooltipProvider>
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
