'use client'

import type { Editor } from '@tiptap/core'
import { BubbleMenu, FloatingMenu } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'

import { InkwiseCitationBubbles } from '@/components/inkwise/citation-bubbles'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiClient, InkwiseBoundSource, InkwiseCitation, InkwiseSseEvent, InkwiseWritingAction } from '@/lib/api'
import { markdownToSafeHtml } from '@/lib/inkwise-markdown'
import { InkwiseMarkdownView } from '@/components/inkwise/markdown-view'

type ToolAction = Exclude<InkwiseWritingAction, 'other'> | 'custom'

type GroundingState = {
  grounded: boolean
  evidenceCount: number
  fallback?: string | null
  evidence?: InkwiseCitation[]
}

type ToolTarget = {
  from: number
  to: number
  text: string
  hasSelection: boolean
}

export function InlineWritingTools({
  editor,
  documentId,
  boundSources,
  onProgrammaticEdit,
}: {
  editor: Editor | null
  documentId: string
  boundSources: InkwiseBoundSource[]
  onProgrammaticEdit?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputMd, setOutputMd] = useState('')
  const [lastAction, setLastAction] = useState<ToolAction | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [instruction, setInstruction] = useState('Improve clarity, keep meaning.')
  const [inserting, setInserting] = useState<null | 'replace' | 'after' | 'insert'>(null)
  const [sourceChecked, setSourceChecked] = useState<Record<string, boolean>>({})
  const [groundingState, setGroundingState] = useState<GroundingState | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const rangeRef = useRef<ToolTarget | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const readySources = useMemo(() => boundSources.filter((item) => item.grounded_chat_ready), [boundSources])
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
        setError(null)
        setOutputMd('')
        setLastAction(null)
        setGroundingState(null)
        setAttemptId(null)
        setPanelOpen(false)
        rangeRef.current = null
      }
    }
    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor, busy])

  function selectionTarget(currentEditor: Editor): ToolTarget | null {
    const { from, to, empty } = currentEditor.state.selection
    if (!empty) {
      const text = currentEditor.state.doc.textBetween(from, to, '\n')
      if (!text.trim()) return null
      return { from, to, text, hasSelection: true }
    }
    return { from, to, text: '', hasSelection: false }
  }

  function activeTarget(): ToolTarget | null {
    return editor ? selectionTarget(editor) : null
  }

  function openPanel() {
    const target = activeTarget()
    if (!target) return
    setPanelOpen(true)
    setCustomOpen(!target.hasSelection)
    rangeRef.current = target
  }

  async function run(action: ToolAction, customInstruction?: string) {
    if (!editor) return
    const selection = selectionTarget(editor)
    if (!selection) return
    if (!selection.hasSelection && action !== 'custom') return

    setError(null)
    setBusy(true)
    setOutputMd('')
    setLastAction(action)
    setGroundingState(null)
    setAttemptId(null)
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
          instruction: (customInstruction ?? instruction).trim(),
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
              fallback: event.data?.grounding_fallback || null,
              evidence: Array.isArray(event.data?.evidence) ? event.data.evidence : [],
            })
          }
          if ((event.event === 'meta' || event.event === 'done') && event.data?.attempt_id) {
            setAttemptId(String(event.data.attempt_id))
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

  async function insert(mode: 'replace' | 'after' | 'insert') {
    if (!editor || !rangeRef.current) return
    const markdown = (outputMd || '').trim()
    if (!markdown) return

    setInserting(mode)
    try {
      const html = await markdownToSafeHtml(markdown)
      if (!html) return

      if (mode === 'replace') {
        onProgrammaticEdit?.()
        editor.chain().focus().insertContentAt({ from: rangeRef.current.from, to: rangeRef.current.to }, html).run()
      } else if (mode === 'insert') {
        onProgrammaticEdit?.()
        editor.chain().focus().insertContentAt(rangeRef.current.to, html).run()
      } else {
        onProgrammaticEdit?.()
        editor.chain().focus().insertContentAt(rangeRef.current.to, `<p></p>${html}`).run()
      }
    } finally {
      setInserting(null)
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  function closePanel() {
    setError(null)
    setOutputMd('')
    setLastAction(null)
    setGroundingState(null)
    setAttemptId(null)
    setCustomOpen(false)
    setPanelOpen(false)
    rangeRef.current = null
  }

  async function retryAttempt(freshRetrieval: boolean) {
    if (!attemptId) return

    setError(null)
    setBusy(true)
    setOutputMd('')
    setGroundingState(null)
    setPanelOpen(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await apiClient.streamInkwiseRetryWritingTool(
        attemptId,
        { fresh_retrieval: freshRetrieval },
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
              fallback: event.data?.grounding_fallback || null,
              evidence: Array.isArray(event.data?.evidence) ? event.data.evidence : [],
            })
          }
          if ((event.event === 'meta' || event.event === 'done') && event.data?.attempt_id) {
            setAttemptId(String(event.data.attempt_id))
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
    <div className="w-[32rem] rounded-2xl border bg-white/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {hasSelection ? (
            <>
              <Button size="sm" onClick={() => run('improve')} disabled={busy}>Improve</Button>
              <Button size="sm" variant="outline" onClick={() => run('concise')} disabled={busy}>Concise</Button>
              <Button size="sm" variant="outline" onClick={() => run('longer')} disabled={busy}>Longer</Button>
              <Button size="sm" variant="outline" onClick={() => setCustomOpen((value) => !value)} disabled={busy}>Custom</Button>
            </>
          ) : (
            <div className="text-sm font-medium text-slate-900">Write with AI</div>
          )}
        </div>
        <div>
          {busy ? <Button size="sm" variant="outline" onClick={stop}>Stop</Button> : outputMd || error ? <Button size="sm" variant="outline" onClick={closePanel}>Close</Button> : null}
        </div>
      </div>

      <div className="mt-3 rounded-xl border bg-slate-50 p-3">
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
                onClick={() => setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, true])))}
                disabled={busy}
              >
                All ready
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSourceChecked(Object.fromEntries(readySources.map((item) => [item.source.id, false])))}
                disabled={busy}
              >
                None
              </Button>
            </div>
          ) : null}
        </div>

        {boundSources.length ? (
          <div className="mt-3 grid max-h-36 gap-2 overflow-auto">
            {boundSources.map((item) => (
              <label key={item.binding_id} className={`flex items-center gap-3 text-sm ${item.grounded_chat_ready ? 'text-slate-700' : 'text-slate-400'}`}>
                <Checkbox
                  checked={sourceChecked[item.source.id] ?? item.grounded_chat_ready}
                  disabled={!item.grounded_chat_ready || busy}
                  onCheckedChange={(checked) => {
                    setSourceChecked((prev) => ({ ...prev, [item.source.id]: Boolean(checked) }))
                  }}
                />
                <span>{item.source.title}</span>
                {!item.grounded_chat_ready ? <span className="text-xs">({item.grounded_chat_reason || 'Not ready'})</span> : null}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {(customOpen || !hasSelection) ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor="inkwise-custom-tool">Instruction</Label>
          <Input id="inkwise-custom-tool" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={hasSelection ? 'e.g. rewrite in a persuasive tone' : 'e.g. draft a concise transition sentence'} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => run('custom', instruction)} disabled={busy || !instruction.trim()}>
              Run
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {busy || outputMd ? (
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="text-sm font-medium text-slate-900">{busy ? 'Writing...' : lastAction ? `Result (${lastAction})` : 'Result'}</div>
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
            {outputMd ? <InkwiseMarkdownView markdown={outputMd} className="prose prose-sm max-w-none" /> : <div className="text-slate-400">...</div>}
          </div>
          {groundingState?.evidence?.length ? (
            <div className="mt-3">
              <InkwiseCitationBubbles citations={groundingState.evidence} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => retryAttempt(false)} disabled={!attemptId || busy}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={() => retryAttempt(true)} disabled={!attemptId || busy}>
              Fresh evidence
            </Button>
            {rangeRef.current?.hasSelection ? (
              <>
                <Button size="sm" variant="outline" onClick={() => insert('after')} disabled={!outputMd || inserting === 'after'}>
                  {inserting === 'after' ? 'Inserting...' : 'Insert after'}
                </Button>
                <Button size="sm" onClick={() => insert('replace')} disabled={!outputMd || inserting === 'replace'}>
                  {inserting === 'replace' ? 'Replacing...' : 'Replace selection'}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => insert('insert')} disabled={!outputMd || inserting === 'insert'}>
                {inserting === 'insert' ? 'Inserting...' : 'Insert'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(outputMd || '')} disabled={!outputMd}>
              Copy
            </Button>
          </div>
        </div>
      ) : null}
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
        tippyOptions={{ duration: 120, maxWidth: 560, placement: 'top', appendTo: () => document.body, interactive: true }}
      >
        {panelOpen && hasSelection ? panel : icon}
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        shouldShow={({ editor }) => Boolean(editor?.isFocused && selectionTarget(editor) && !selectionTarget(editor)?.hasSelection)}
        tippyOptions={{ duration: 120, maxWidth: 560, placement: 'top', appendTo: () => document.body, interactive: true }}
      >
        {panelOpen && !hasSelection ? panel : icon}
      </FloatingMenu>
    </>
  )
}
