'use client'

import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cloud, Download, History, LibraryBig, Loader2, Maximize2, MessageSquarePlus, MessageSquareText, Minimize2, MoreHorizontal, PanelRightClose, PanelRightOpen, Save, Settings2, Sparkles, Trash2, Unplug, Volume2, VolumeX, Wand2, X } from 'lucide-react'

import { InkwiseEditor, type InkwiseEditorReviewState } from '@/components/inkwise/inkwise-editor'
import { InkwiseSourceImportPanel } from '@/components/inkwise/source-import-panel'
import { InlineWritingTools } from '@/components/inkwise/inline-writing-tools'
import { InkwiseChatDebugSheet } from '@/components/inkwise/chat-debug-sheet'
import { InkwiseCitationBubbles } from '@/components/inkwise/citation-bubbles'
import { RainBackground } from '@/components/inkwise/rain-background'
import { InkwiseMarkdownView } from '@/components/inkwise/markdown-view'
import { GoogleDriveFolderPicker } from '@/components/integrations/GoogleDriveFolderPicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useGaplessAudioLoop } from '@/hooks/useGaplessAudioLoop'
import { useToast } from '@/hooks/use-toast'
import {
  useInkwiseChatMessages,
  useInkwiseChatThreads,
  useInkwiseDocument,
  useInkwiseDocumentRevisions,
  useInkwiseDocumentSources,
  useInkwiseSources,
} from '@/hooks/useInkwise'
import {
  ApiError,
  apiClient,
  InkwiseChatMessage,
  InkwiseCitation,
  InkwiseCitationStyle,
  InkwiseDebugTimelineEntry,
  InkwiseDocumentRevision,
  InkwiseDriveExportResponse,
  InkwisePredictionRequest,
  InkwisePredictionResponse,
  InkwiseSseEvent,
} from '@/lib/api'
import { diffParagraphs } from '@/lib/inkwise-diff'
import {
  getInkwiseEditorTarget,
  type InkwiseEditorTarget,
  insertMarkdownIntoEditor,
  replaceEditorDocumentWithMarkdown,
  stripInkwiseChatCitationMarkers,
} from '@/lib/inkwise-editor'
import {
  acceptAllInkwiseTrackedChanges,
  acceptInkwiseTrackedChange,
  rejectAllInkwiseTrackedChanges,
  rejectInkwiseTrackedChange,
  removeInkwiseComment,
  updateInkwiseComment,
} from '@/lib/inkwise-editor-extensions'
import { INKWISE_CITATION_STYLE_OPTIONS } from '@/lib/inkwise-citation-format'
import { markdownToSafeHtml } from '@/lib/inkwise-markdown'
import { INKWISE_SOURCE_POLL_INTERVAL_MS, isInkwiseSourceActiveStatus } from '@/lib/inkwise-source-status'
import { cn, compareNaturalText } from '@/lib/utils'

const MAX_PREDICTION_BEFORE_TEXT = 12000
const MAX_PREDICTION_AFTER_TEXT = 4000
const MAX_PREDICTION_BLOCK_TEXT = 4000
const PREDICTION_DEBOUNCE_MS = 1000
const FOCUS_MODE_MUTE_STORAGE_KEY = 'cpaa_inkwise_focus_mode_muted_v1'
const FOCUS_MODE_AUDIO_SRC = '/audio/inkwise-white-noise-loop.mp3'

type StreamState = {
  text: string
  contentWithCitations?: string | null
  retrievalRunId?: string
  citations?: InkwiseCitation[]
  attemptId?: string
  debugTimeline?: InkwiseDebugTimelineEntry[]
}

type PredictionState = {
  text: string
  contentWithCitations?: string | null
  grounded: boolean
  evidence: InkwiseCitation[]
  attemptId?: string | null
  retrievalRunId?: string | null
}

type ImprovedDraftResult = {
  markdown: string
  contentWithCitations?: string | null
  grounded: boolean
  evidence: InkwiseCitation[]
  attemptId?: string | null
  retrievalRunId?: string | null
}

type PredictionContext = {
  beforeText: string
  afterText: string
  beforeCursorInBlock: string
  afterCursorInBlock: string
}

type ChatInsertMode = 'insert' | 'replace' | 'append'

type DriveFolderSelection = {
  id: string
  name: string
  url?: string
}

const assistantMarkdownClassName =
  'prose prose-sm max-w-none break-words text-slate-700 prose-headings:text-slate-900 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-blockquote:border-slate-300 prose-blockquote:text-slate-600 prose-pre:bg-slate-950 prose-pre:text-slate-50 prose-code:text-slate-800 prose-a:text-sky-700'

function messageCitations(message: InkwiseChatMessage): InkwiseCitation[] {
  const raw = message.citations_json?.citations
  return Array.isArray(raw) ? raw : []
}

function messageDisplayMarkdown(message: InkwiseChatMessage): string {
  return message.content_with_citations || message.citations_json?.content_with_citations || message.content || ''
}

function messageAttemptId(message: InkwiseChatMessage): string | null {
  return typeof message.provider_meta?.attempt_id === 'string' ? message.provider_meta.attempt_id : null
}

function messageRetrievalRunId(message: InkwiseChatMessage): string | null {
  return message.citations_json?.retrieval_run_id || null
}

function upsertDebugTimelineEntry(entries: InkwiseDebugTimelineEntry[] | undefined, entry: InkwiseDebugTimelineEntry): InkwiseDebugTimelineEntry[] {
  const current = entries ?? []
  const index = current.findIndex((item) => item.stage === entry.stage)
  if (index < 0) return [...current, entry]
  const next = [...current]
  next[index] = {
    ...next[index],
    ...entry,
    details: entry.details ?? next[index].details,
    error: entry.error ?? next[index].error,
  }
  return next
}

function normalizePredictionState(prediction: InkwisePredictionResponse): PredictionState | null {
  const text = prediction?.suggestion_text || ''
  if (!text.trim()) return null
  return {
    text,
    contentWithCitations: prediction.content_with_citations || text,
    grounded: Boolean(prediction.grounded),
    evidence: Array.isArray(prediction.citations) && prediction.citations.length ? prediction.citations : Array.isArray(prediction.evidence) ? prediction.evidence : [],
    attemptId: prediction.attempt_id || null,
    retrievalRunId: prediction.retrieval_run_id || null,
  }
}

function buildDraftSelectionLabel(target: InkwiseEditorTarget | null): string | undefined {
  const preview = (target?.text || '').replace(/\s+/g, ' ').trim()
  if (!preview) return undefined
  return preview.length > 80 ? `${preview.slice(0, 77)}...` : preview
}

export default function InkwiseDocumentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const documentId = params.id

  const documentQuery = useInkwiseDocument(documentId)
  const sourcesQuery = useInkwiseSources(1, 100, {
    refetchInterval: (query) => {
      const data = query.state.data as { items?: Array<{ status?: string | null }> } | undefined
      return data?.items?.some((source) => isInkwiseSourceActiveStatus(source.status)) ? INKWISE_SOURCE_POLL_INTERVAL_MS : false
    },
    refetchOnWindowFocus: true,
  })
  const bindingsQuery = useInkwiseDocumentSources(documentId, {
    refetchInterval: (query) => {
      const data = query.state.data as { sources?: Array<{ source?: { status?: string | null } | null }> } | undefined
      return data?.sources?.some((binding) => isInkwiseSourceActiveStatus(binding.source?.status)) ? INKWISE_SOURCE_POLL_INTERVAL_MS : false
    },
    refetchOnWindowFocus: true,
  })
  const threadsQuery = useInkwiseChatThreads(documentId)
  const revisionsQuery = useInkwiseDocumentRevisions(documentId)

  const [title, setTitle] = useState('')
  const [initPrompt, setInitPrompt] = useState('')
  const [citationStyle, setCitationStyle] = useState<InkwiseCitationStyle>('default')
  const [contentHtml, setContentHtml] = useState('')
  const [contentJson, setContentJson] = useState<JSONContent | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()
  const [chatInput, setChatInput] = useState('')
  const [streamState, setStreamState] = useState<StreamState | null>(null)
  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const [editorTarget, setEditorTarget] = useState<InkwiseEditorTarget | null>(null)
  const [predictionState, setPredictionState] = useState<PredictionState | null>(null)
  const [predictionLoading, setPredictionLoading] = useState(false)
  const [predictionTick, setPredictionTick] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'references' | 'review'>('chat')
  const [chatSourceChecked, setChatSourceChecked] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [driveExportOpen, setDriveExportOpen] = useState(false)
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false)
  const [driveExportFolder, setDriveExportFolder] = useState<DriveFolderSelection | null>(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [chatInsertKey, setChatInsertKey] = useState<string | null>(null)
  const [chatDebugTarget, setChatDebugTarget] = useState<{ attemptId?: string | null; retrievalRunId?: string | null } | null>(null)
  const [trackChangesEnabled, setTrackChangesEnabled] = useState(false)
  const [reviewState, setReviewState] = useState<InkwiseEditorReviewState>({ comments: [], changes: [] })
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [browserFullscreenActive, setBrowserFullscreenActive] = useState(false)
  const [focusModeMuted, setFocusModeMuted] = useState(false)
  const [focusMutePreferenceReady, setFocusMutePreferenceReady] = useState(false)
  const predictionTimeoutRef = useRef<number | null>(null)
  const predictionSeqRef = useRef(0)
  const predictionAbortRef = useRef<AbortController | null>(null)
  const citationSheetOpenRef = useRef(false)
  const focusModeEnabledRef = useRef(false)
  const fullscreenWasActiveRef = useRef(false)
  const { syncFocusAudio, cleanup: cleanupFocusAudio } = useGaplessAudioLoop(FOCUS_MODE_AUDIO_SRC, 0.18)

  const clearPredictionTimeout = () => {
    if (predictionTimeoutRef.current) {
      window.clearTimeout(predictionTimeoutRef.current)
      predictionTimeoutRef.current = null
    }
  }

  const abortPredictionRequest = () => {
    predictionAbortRef.current?.abort()
    predictionAbortRef.current = null
  }

  const clearPrediction = () => {
    clearPredictionTimeout()
    abortPredictionRequest()
    predictionSeqRef.current += 1
    setPredictionLoading(false)
    setPredictionState(null)
  }

  const onCitationSheetOpenChange = useCallback((open: boolean) => {
    citationSheetOpenRef.current = open
  }, [])

  useEffect(() => {
    if (!documentQuery.data) return
    clearPrediction()
    setTitle(documentQuery.data.title || 'Untitled document')
    setInitPrompt(documentQuery.data.init_prompt || '')
    setCitationStyle(documentQuery.data.citation_style || 'default')
    setContentHtml(documentQuery.data.content_html || '')
    setContentJson((documentQuery.data.content_json as JSONContent | null) ?? null)
    setVersion(documentQuery.data.version)
    setEditorTarget(null)
  }, [documentQuery.data])

  useEffect(() => {
    const firstThread = threadsQuery.data?.threads[0]?.id
    if (firstThread && !selectedThreadId) {
      setSelectedThreadId(firstThread)
    }
  }, [threadsQuery.data, selectedThreadId])

  useEffect(() => {
    const firstRevisionId = revisionsQuery.data?.items[0]?.id
    if (firstRevisionId && !selectedRevisionId) {
      setSelectedRevisionId(firstRevisionId)
    }
  }, [revisionsQuery.data, selectedRevisionId])

  useEffect(() => {
    focusModeEnabledRef.current = focusModeEnabled
  }, [focusModeEnabled])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FOCUS_MODE_MUTE_STORAGE_KEY)
      if (stored === 'true' || stored === 'false') {
        setFocusModeMuted(stored === 'true')
      }
    } catch {
      // localStorage unavailable
    } finally {
      setFocusMutePreferenceReady(true)
    }
  }, [])

  useEffect(() => {
    if (!focusMutePreferenceReady) return
    try {
      window.localStorage.setItem(FOCUS_MODE_MUTE_STORAGE_KEY, String(focusModeMuted))
    } catch {
      // localStorage unavailable
    }
  }, [focusModeMuted, focusMutePreferenceReady])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement)
      setBrowserFullscreenActive(active)

      if (!active && fullscreenWasActiveRef.current && focusModeEnabledRef.current) {
        setFocusModeEnabled(false)
      }

      fullscreenWasActiveRef.current = active
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (!focusModeEnabled || browserFullscreenActive) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusModeEnabled(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [focusModeEnabled, browserFullscreenActive])

  useEffect(() => {
    if (!focusModeEnabled) return

    document.body.classList.add('inkwise-focus-mode-active')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.classList.remove('inkwise-focus-mode-active')
      document.body.style.overflow = previousOverflow
    }
  }, [focusModeEnabled])

  const messagesQuery = useInkwiseChatMessages(selectedThreadId)

  const boundSources = useMemo(() => {
    const items = [...(bindingsQuery.data?.sources ?? [])]
    items.sort((left, right) => compareNaturalText(left.source.title, right.source.title))
    return items
  }, [bindingsQuery.data?.sources])
  const availableSources = useMemo(() => {
    const allSources = sourcesQuery.data?.items ?? []
    const boundIds = new Set(boundSources.map((item) => item.source.id))
    return allSources
      .filter((source) => !boundIds.has(source.id))
      .sort((left, right) => compareNaturalText(left.title, right.title))
  }, [sourcesQuery.data?.items, boundSources])
  const readyChatSources = useMemo(() => boundSources.filter((item) => item.grounded_chat_ready), [boundSources])
  const selectedChatSourceIds = useMemo(
    () => readyChatSources.filter((item) => chatSourceChecked[item.source.id] ?? true).map((item) => item.source.id),
    [readyChatSources, chatSourceChecked]
  )
  const activeDraftSelection = useMemo(() => (editorTarget?.hasSelection ? editorTarget : null), [editorTarget])
  const draftSelectionLabel = useMemo(() => buildDraftSelectionLabel(activeDraftSelection), [activeDraftSelection])

  useEffect(() => {
    if (!readyChatSources.length) return
    setChatSourceChecked((prev) => {
      const next: Record<string, boolean> = {}
      for (const item of readyChatSources) next[item.source.id] = prev[item.source.id] ?? true
      return next
    })
  }, [readyChatSources])

  const saveDocument = useMutation({
    mutationFn: async () => {
      if (version == null) throw new Error('Document is not ready yet')
      return apiClient.updateInkwiseDocument(documentId, {
        version,
        title,
        init_prompt: initPrompt,
        citation_style: citationStyle,
        content_json: (contentJson as Record<string, any> | null) ?? null,
        content_html: contentHtml,
      })
    },
    onSuccess: async (updated) => {
      setTitle(updated.title || 'Untitled document')
      setInitPrompt(updated.init_prompt || '')
      setCitationStyle(updated.citation_style || 'default')
      setContentHtml(updated.content_html || '')
      setContentJson((updated.content_json as JSONContent | null) ?? null)
      setVersion(updated.version)
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-revisions', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save document', description: error.message, variant: 'destructive' })
    },
  })

  const deleteDocument = useMutation({
    mutationFn: () => apiClient.deleteInkwiseDocument(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      toast({ title: 'Document deleted', description: 'The draft was removed from Inkwise.' })
      router.push('/dashboard/inkwise/write')
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete document', description: error.message, variant: 'destructive' })
    },
  })

  const restoreRevision = useMutation({
    mutationFn: (revisionId: string) => apiClient.restoreInkwiseDocumentRevision(documentId, revisionId),
    onSuccess: async (updated) => {
      clearPrediction()
      setTitle(updated.title || 'Untitled document')
      setInitPrompt(updated.init_prompt || '')
      setCitationStyle(updated.citation_style || 'default')
      setContentHtml(updated.content_html || '')
      setContentJson((updated.content_json as JSONContent | null) ?? null)
      setVersion(updated.version)
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-revisions', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      toast({ title: 'Revision restored', description: 'The selected revision is now the current document state.' })
      setHistoryOpen(false)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not restore revision', description: error.message, variant: 'destructive' })
    },
  })

  const createThread = useMutation({
    mutationFn: () => apiClient.createInkwiseChatThread({ document_id: documentId, title: null }),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-threads', documentId] })
      setSelectedThreadId(thread.id)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create thread', description: error.message, variant: 'destructive' })
    },
  })

  const deleteThread = useMutation({
    mutationFn: (threadId: string) => apiClient.deleteInkwiseChatThread(threadId),
    onSuccess: async (_data, threadId) => {
      if (selectedThreadId === threadId) {
        setSelectedThreadId(undefined)
      }
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-threads', documentId] })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete thread', description: error.message, variant: 'destructive' })
    },
  })

  const bindSources = useMutation({
    mutationFn: (sourceIds: string[]) => apiClient.bindInkwiseSources(documentId, sourceIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-sources', documentId] })
      toast({ title: 'Sources bound', description: 'The selected references are now available for grounding.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not bind sources', description: error.message, variant: 'destructive' })
    },
  })

  const unbindSources = useMutation({
    mutationFn: (sourceIds: string[]) => apiClient.unbindInkwiseSources(documentId, sourceIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-sources', documentId] })
      toast({ title: 'Sources removed', description: 'The source was unbound from this document.' })
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove source', description: error.message, variant: 'destructive' })
    },
  })

  const sendChat = useMutation({
    mutationFn: async () => {
      let threadId = selectedThreadId
      if (!threadId) {
        const created = await apiClient.createInkwiseChatThread({ document_id: documentId, title: null })
        threadId = created.id
        setSelectedThreadId(created.id)
      }

      setStreamState({ text: '' })
      await apiClient.streamInkwiseChatMessage(
        threadId,
        {
          content: chatInput,
          source_ids: selectedChatSourceIds,
          draft_selection_text: activeDraftSelection?.text || null,
          draft_selection_label: draftSelectionLabel || null,
        },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            setStreamState((current) => ({ ...(current ?? { text: '' }), text: `${current?.text ?? ''}${event.data?.text ?? ''}` }))
          }
          if (event.event === 'debug' && event.data?.stage && event.data?.label) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
              debugTimeline: upsertDebugTimelineEntry(current?.debugTimeline, event.data as InkwiseDebugTimelineEntry),
            }))
          }
          if (event.event === 'meta' && event.data?.citations) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
              contentWithCitations: typeof event.data?.content_with_citations === 'string' ? event.data.content_with_citations : current?.contentWithCitations,
              retrievalRunId: event.data?.retrieval_run_id,
              citations: event.data?.citations,
              attemptId: event.data?.attempt_id,
            }))
          }
          if (event.event === 'done') {
            setStreamState((current) => ({ ...(current ?? { text: '' }), retrievalRunId: event.data?.retrieval_run_id, attemptId: event.data?.attempt_id }))
          }
        }
      )
      return threadId
    },
    onSuccess: async (threadId) => {
      setChatInput('')
      setStreamState(null)
      if (threadId) {
        await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-messages', threadId] })
      }
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-threads', documentId] })
    },
    onError: (error: Error) => {
      toast({ title: 'Chat request failed', description: error.message, variant: 'destructive' })
    },
  })

  const retryChat = useMutation({
    mutationFn: async ({ messageId, freshRetrieval }: { messageId: string; freshRetrieval: boolean }) => {
      if (!selectedThreadId) throw new Error('No chat thread selected')

      setStreamState({ text: '' })
      await apiClient.streamInkwiseRetryChatMessage(
        selectedThreadId,
        messageId,
        { fresh_retrieval: freshRetrieval },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            setStreamState((current) => ({ ...(current ?? { text: '' }), text: `${current?.text ?? ''}${event.data?.text ?? ''}` }))
          }
          if (event.event === 'debug' && event.data?.stage && event.data?.label) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
              debugTimeline: upsertDebugTimelineEntry(current?.debugTimeline, event.data as InkwiseDebugTimelineEntry),
            }))
          }
          if (event.event === 'meta' && event.data?.citations) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
              contentWithCitations: typeof event.data?.content_with_citations === 'string' ? event.data.content_with_citations : current?.contentWithCitations,
              retrievalRunId: event.data?.retrieval_run_id,
              citations: event.data?.citations,
              attemptId: event.data?.attempt_id,
            }))
          }
          if (event.event === 'done') {
            setStreamState((current) => ({ ...(current ?? { text: '' }), retrievalRunId: event.data?.retrieval_run_id, attemptId: event.data?.attempt_id }))
          }
        }
      )
      return selectedThreadId
    },
    onSuccess: async (threadId) => {
      setStreamState(null)
      if (threadId) {
        await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-messages', threadId] })
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Retry failed', description: error.message, variant: 'destructive' })
    },
  })

  const runWritingTool = useMutation({
    mutationFn: async (): Promise<ImprovedDraftResult> => {
      const selection = contentHtml.trim()
      if (!selection) throw new Error('Add some document content before using a writing tool')

      let output = ''
      let contentWithCitations: string | null = null
      let grounded = false
      let evidence: InkwiseCitation[] = []
      let attemptId: string | null = null
      let retrievalRunId: string | null = null
      await apiClient.streamInkwiseWritingTool(
        {
          action: 'coherent',
          document_id: documentId,
          selection_text: selection,
          surrounding_text: initPrompt,
          instruction: 'Make this draft more coherent while preserving the original intent, structure, and grounded support.',
        },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            output += event.data?.text ?? ''
          }
          if (event.event === 'meta') {
            if (typeof event.data?.grounded === 'boolean') {
              grounded = Boolean(event.data.grounded)
            }
            if (Array.isArray(event.data?.evidence)) {
              evidence = event.data.evidence
            }
            if (event.data?.attempt_id) {
              attemptId = String(event.data.attempt_id)
            }
            if (event.data?.retrieval_run_id) {
              retrievalRunId = String(event.data.retrieval_run_id)
            }
          }
          if (event.event === 'done') {
            if (event.data?.attempt_id) {
              attemptId = String(event.data.attempt_id)
            }
            if (event.data?.retrieval_run_id) {
              retrievalRunId = String(event.data.retrieval_run_id)
            }
            if (event.data?.content_with_citations) {
              contentWithCitations = String(event.data.content_with_citations)
            }
            if (Array.isArray(event.data?.citations) && event.data.citations.length) {
              evidence = event.data.citations
            }
          }
        }
      )
      return {
        markdown: output,
        contentWithCitations,
        grounded,
        evidence,
        attemptId,
        retrievalRunId,
      }
    },
    onSuccess: async (result) => {
      const markdown = result.markdown.trim()
      if (!markdown) return

      try {
        clearPrediction()
        if (editor) {
          const applied = await replaceEditorDocumentWithMarkdown({
            editor,
            markdown,
            citationAnchor: result.grounded && result.evidence.length
                  ? {
                      sourceKind: 'writing_tool',
                      citations: result.evidence,
                      citationStyle,
                      attemptId: result.attemptId,
                      retrievalRunId: result.retrievalRunId,
                      contentWithCitations: result.contentWithCitations || markdown,
                  }
                : null,
          })
          if (!applied) return
        } else {
          const html = await markdownToSafeHtml(markdown)
          if (!html) return
          setContentJson(null)
          setContentHtml(html)
        }
        toast({ title: 'Draft refreshed', description: 'The writing tool returned a revised version in the editor.' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The AI response could not be rendered as Markdown.'
        toast({ title: 'Could not render draft', description: message, variant: 'destructive' })
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Writing tool failed', description: error.message, variant: 'destructive' })
    },
  })

  const handleExport = async (type: 'pdf' | 'docx') => {
    try {
      const result = await apiClient.exportInkwiseDocument(documentId, type)
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      toast({ title: 'Could not export document', description: message, variant: 'destructive' })
    }
  }

  const exportToDrive = useMutation({
    mutationFn: (type: 'pdf' | 'docx') =>
      apiClient.exportInkwiseDocumentToDrive(documentId, {
        type,
        folder_id: driveExportFolder?.id || null,
      }),
    onSuccess: (result: InkwiseDriveExportResponse) => {
      toast({ title: 'Exported to Google Drive', description: `${result.name} was created in Google Drive.` })
      if (result.webViewLink) {
        window.open(result.webViewLink, '_blank', 'noopener,noreferrer')
      }
      setDriveExportOpen(false)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not export to Google Drive', description: error.message, variant: 'destructive' })
    },
  })

  const copyAssistantMessage = useCallback(async (message: InkwiseChatMessage) => {
    const cleaned = stripInkwiseChatCitationMarkers(message.content || '')
    if (!cleaned) {
      toast({ title: 'Nothing to copy', description: 'This assistant message has no document-ready text.' })
      return
    }

    try {
      await navigator.clipboard.writeText(cleaned)
      toast({ title: 'Copied', description: 'Chat output is ready to paste into the document.' })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Clipboard access failed'
      toast({ title: 'Could not copy text', description: messageText, variant: 'destructive' })
    }
  }, [toast])

  const insertAssistantMessage = useCallback(async (message: InkwiseChatMessage, mode: ChatInsertMode) => {
    if (!editor) {
      toast({ title: 'Editor not ready', description: 'Wait for the document editor to finish loading.', variant: 'destructive' })
      return
    }

    const cleaned = stripInkwiseChatCitationMarkers(message.content || '')
    if (!cleaned) {
      toast({ title: 'Nothing to insert', description: 'This assistant message has no document-ready text.' })
      return
    }

    const key = `${message.id}:${mode}`
    setChatInsertKey(key)

    try {
      clearPrediction()
      const appliedMode = await insertMarkdownIntoEditor({
        editor,
        markdown: cleaned,
        mode,
        target: mode === 'append' ? null : editorTarget,
        citationAnchor: messageCitations(message).length
          ? {
              sourceKind: 'chat',
              citations: messageCitations(message),
              citationStyle,
              attemptId: typeof message.provider_meta?.attempt_id === 'string' ? message.provider_meta.attempt_id : null,
              retrievalRunId: message.citations_json?.retrieval_run_id || null,
              contentWithCitations: message.content_with_citations || message.citations_json?.content_with_citations || message.content || cleaned,
            }
          : null,
      })

      if (!appliedMode) {
        throw new Error('The assistant response could not be inserted into the editor.')
      }

      setEditorTarget(getInkwiseEditorTarget(editor))

      const description =
        appliedMode === 'replace'
          ? 'Chat output replaced the selected draft text.'
          : appliedMode === 'append'
            ? 'Chat output was appended to the end of the document.'
            : 'Chat output was inserted at the cursor.'

      toast({ title: 'Draft updated', description })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Insertion failed'
      toast({ title: 'Could not insert chat output', description: messageText, variant: 'destructive' })
    } finally {
      setChatInsertKey(null)
    }
  }, [editor, editorTarget, toast])

  const renderedMessages: InkwiseChatMessage[] = messagesQuery.data?.items ?? []
  const latestAssistantMessageId = useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      if (renderedMessages[index]?.role === 'assistant') return renderedMessages[index].id
    }
    return undefined
  }, [renderedMessages])
  const selectedRevision = useMemo<InkwiseDocumentRevision | undefined>(
    () => revisionsQuery.data?.items.find((item) => item.id === selectedRevisionId),
    [revisionsQuery.data, selectedRevisionId]
  )
  const comparisonRevision = useMemo<InkwiseDocumentRevision | undefined>(() => {
    const items = revisionsQuery.data?.items ?? []
    const index = items.findIndex((item) => item.id === selectedRevisionId)
    if (index < 0 || index >= items.length - 1) return undefined
    return items[index + 1]
  }, [revisionsQuery.data, selectedRevisionId])
  const selectedRevisionText = useMemo(() => stripHtml(selectedRevision?.content_html), [selectedRevision])
  const comparisonRevisionText = useMemo(() => stripHtml(comparisonRevision?.content_html), [comparisonRevision])
  const revisionDiffBlocks = useMemo(
    () => diffParagraphs(comparisonRevisionText, selectedRevisionText),
    [comparisonRevisionText, selectedRevisionText]
  )
  const primaryChatInsertMode: ChatInsertMode = editorTarget ? 'insert' : 'append'
  const primaryChatInsertLabel = editorTarget ? 'Insert at cursor' : 'Append to end'
  const pendingCommentCount = useMemo(() => reviewState.comments.filter((comment) => !comment.resolved).length, [reviewState.comments])
  const pendingChangeCount = reviewState.changes.length
  const focusModeStatusLabel = browserFullscreenActive ? 'Browser fullscreen active' : 'Overlay fallback active'

  const focusEditorRange = useCallback((from: number, to: number) => {
    if (!editor) return
    editor.chain().focus().setTextSelection({ from, to }).run()
  }, [editor])

  const handleCommentResolvedChange = useCallback((commentId: string, resolved: boolean) => {
    if (!editor) return
    clearPrediction()
    updateInkwiseComment(editor, commentId, { resolved })
  }, [editor])

  const handleCommentDelete = useCallback((commentId: string) => {
    if (!editor) return
    clearPrediction()
    removeInkwiseComment(editor, commentId)
  }, [editor])

  const handleAcceptChange = useCallback((changeId: string) => {
    if (!editor) return
    clearPrediction()
    acceptInkwiseTrackedChange(editor, changeId)
  }, [editor])

  const handleRejectChange = useCallback((changeId: string) => {
    if (!editor) return
    clearPrediction()
    rejectInkwiseTrackedChange(editor, changeId)
  }, [editor])

  const handleAcceptAllChanges = useCallback(() => {
    if (!editor) return
    clearPrediction()
    acceptAllInkwiseTrackedChanges(editor)
  }, [editor])

  const handleRejectAllChanges = useCallback(() => {
    if (!editor) return
    clearPrediction()
    rejectAllInkwiseTrackedChanges(editor)
  }, [editor])

  const enterFocusMode = useCallback(async () => {
    setFocusModeEnabled(true)
    syncFocusAudio(true, focusModeMuted, true)

    if (document.fullscreenElement) {
      setBrowserFullscreenActive(true)
      fullscreenWasActiveRef.current = true
      return
    }

    try {
      await document.documentElement.requestFullscreen()
    } catch {
      setBrowserFullscreenActive(false)
      fullscreenWasActiveRef.current = false
    }
  }, [focusModeMuted, syncFocusAudio])

  const exitFocusMode = useCallback(() => {
    setFocusModeEnabled(false)
    syncFocusAudio(false, focusModeMuted, false)

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Ignore browser-specific fullscreen exit failures.
      })
    }
  }, [focusModeMuted, syncFocusAudio])

  const toggleFocusModeMuted = useCallback(() => {
    const nextMuted = !focusModeMuted
    setFocusModeMuted(nextMuted)
    syncFocusAudio(focusModeEnabled, nextMuted, focusModeEnabled && !nextMuted)
  }, [focusModeEnabled, focusModeMuted, syncFocusAudio])

  useEffect(() => {
    syncFocusAudio(focusModeEnabled, focusModeMuted, false)
  }, [focusModeEnabled, focusModeMuted, syncFocusAudio])

  useEffect(() => {
    return () => {
      document.body.classList.remove('inkwise-focus-mode-active')
      cleanupFocusAudio()
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
          // Ignore browser-specific fullscreen exit failures.
        })
      }
    }
  }, [cleanupFocusAudio])

  useEffect(() => {
    if (!editor) {
      setEditorTarget(null)
      return
    }

    setEditorTarget(getInkwiseEditorTarget(editor))

    const onSelection = () => {
      setEditorTarget(getInkwiseEditorTarget(editor))
      clearPrediction()
    }

    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || !documentQuery.data) return
    clearPredictionTimeout()
    abortPredictionRequest()

    if (!editor.isFocused || Boolean((editor.view as { composing?: boolean }).composing)) {
      setPredictionLoading(false)
      setPredictionState(null)
      return
    }

    const { empty } = editor.state.selection
    if (!empty) {
      setPredictionLoading(false)
      setPredictionState(null)
      return
    }

    const context = getPredictionContext(editor)
    const beforeText = context.beforeText

    if (!beforeText.trim()) {
      setPredictionLoading(false)
      setPredictionState(null)
      return
    }

    const requestBody = buildPredictionRequest(context)

    const seq = ++predictionSeqRef.current
    predictionTimeoutRef.current = window.setTimeout(async () => {
      if (seq !== predictionSeqRef.current) return
      const controller = new AbortController()
      predictionAbortRef.current = controller
      setPredictionLoading(true)
      try {
        const prediction = await apiClient.createInkwisePrediction(documentId, requestBody, { signal: controller.signal })
        if (seq === predictionSeqRef.current) {
          setPredictionLoading(false)
          setPredictionState(normalizePredictionState(prediction))
        }
      } catch (error) {
        if (isAbortError(error)) return
        logPredictionError(error)
        if (seq === predictionSeqRef.current) {
          setPredictionLoading(false)
          setPredictionState(null)
        }
      } finally {
        if (predictionAbortRef.current === controller) {
          predictionAbortRef.current = null
        }
      }
    }, PREDICTION_DEBOUNCE_MS)

    return () => {
      clearPredictionTimeout()
      if (seq === predictionSeqRef.current) {
        setPredictionLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, documentId, documentQuery.data, predictionTick])

  if (documentQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading document...
        </CardContent>
      </Card>
    )
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-slate-500">
          Could not load this Inkwise document.
        </CardContent>
      </Card>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        focusModeEnabled && 'fixed inset-0 z-40 isolate overflow-hidden px-4 pb-6 pt-4 sm:px-6 lg:px-8'
      )}
    >
      <div className={cn('absolute inset-0 pointer-events-none', !focusModeEnabled && 'hidden')}>
          <div className="inkwise-focus-backdrop pointer-events-none absolute inset-0" />
          <RainBackground
            active={focusModeEnabled}
            lightning={false}
          />
      </div>
      <div className={cn('sticky top-0 z-20 flex items-center justify-between gap-3 py-2', !focusModeEnabled && 'hidden')}>
            <div className="min-w-0 rounded-full border border-white/15 bg-slate-950/25 px-4 py-3 text-white shadow-lg backdrop-blur-xl">
              <div className="truncate text-sm font-semibold">{title || 'Untitled document'}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/65">{focusModeStatusLabel}</div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/25 p-2 shadow-lg backdrop-blur-xl">
              <Button
                variant="outline"
                size="sm"
                className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => saveDocument.mutate()}
                disabled={saveDocument.isPending || version == null}
              >
                {saveDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={toggleFocusModeMuted}
                aria-label={focusModeMuted ? 'Unmute white noise' : 'Mute white noise'}
              >
                {focusModeMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={exitFocusMode}
              >
                <Minimize2 className="mr-2 h-4 w-4" />
                Exit focus
              </Button>
            </div>
      </div>

      <section className={cn('rounded-3xl border bg-white shadow-sm', focusModeEnabled && 'hidden')}>
          <div className="flex flex-col gap-2 px-5 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Input
                id="inkwise-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Document title"
                className="h-auto border-0 px-0 text-lg font-semibold tracking-tight shadow-none focus-visible:ring-0"
              />
              <div className="text-xs text-slate-500">
                {version != null ? `Version ${version}` : 'Draft'} · {initPrompt.trim() ? 'Guidance active' : 'No guidance set'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => runWritingTool.mutate()} disabled={runWritingTool.isPending}>
                {runWritingTool.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                Coherent draft
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="mr-1.5 h-4 w-4" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={() => void enterFocusMode()}>
                <Maximize2 className="mr-1.5 h-4 w-4" />
                Focus mode
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('docx')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export as DOCX
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDriveExportOpen(true)}>
                    <Cloud className="mr-2 h-4 w-4" />
                    Export to Drive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                    <History className="mr-2 h-4 w-4" />
                    Version history
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => deleteDocument.mutate()}
                    disabled={deleteDocument.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete document
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button size="sm" onClick={() => saveDocument.mutate()} disabled={saveDocument.isPending || version == null}>
                {saveDocument.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
      </section>

      <div className={cn('flex min-h-[72vh] flex-col gap-4 xl:flex-row', focusModeEnabled && 'relative z-10 min-h-0 flex-1')}>
        <section className={cn('min-w-0 flex-1 rounded-3xl border bg-white shadow-sm', focusModeEnabled && 'flex min-h-0 flex-col border-transparent bg-transparent shadow-none')}>
          <div className={cn('flex items-center justify-between border-b px-5 py-4', focusModeEnabled && 'hidden')}>
              <div>
                <div className="text-sm font-semibold text-slate-900">Write</div>
                <div className="text-xs text-slate-500">The editor is central while chat and references are in the sidebar.</div>
              </div>
          </div>

          <div className={cn('space-y-4 px-4 py-4 sm:px-5', focusModeEnabled && 'mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-5 px-0 py-4 sm:px-0')}>

            <InlineWritingTools
              editor={editor}
              documentId={documentId}
              boundSources={boundSources}
              citationStyle={citationStyle}
            />

            <InkwiseEditor
              contentJson={contentJson}
              contentHtml={contentHtml}
              placeholder="Start writing here..."
              onEditor={setEditor}
              trackChangesEnabled={trackChangesEnabled}
              onTrackChangesEnabledChange={setTrackChangesEnabled}
              onReviewDataChange={setReviewState}
              predictionText={predictionState?.text || ''}
              predictionLoading={predictionLoading}
              onAcceptPrediction={() => {
                if (!editor || !predictionState?.text) return
                clearPrediction()
                void (async () => {
                  try {
                    await insertMarkdownIntoEditor({
                      editor,
                      markdown: predictionState.text,
                      mode: 'inline',
                      target: getInkwiseEditorTarget(editor),
                      citationAnchor: predictionState.grounded && predictionState.evidence.length
                        ? {
                            sourceKind: 'prediction',
                            citations: predictionState.evidence,
                            citationStyle,
                            attemptId: predictionState.attemptId,
                            retrievalRunId: predictionState.retrievalRunId,
                            contentWithCitations: predictionState.contentWithCitations || predictionState.text,
                          }
                        : null,
                    })
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Could not insert prediction'
                    toast({ title: 'Prediction insert failed', description: message, variant: 'destructive' })
                  }
                })()
              }}
              onDismissPrediction={() => {
                clearPrediction()
              }}
              onUserTyping={() => setPredictionTick((tick) => tick + 1)}
              onBlur={() => {
                if (!citationSheetOpenRef.current) {
                  clearPrediction()
                }
                saveDocument.mutate()
              }}
              onChange={(value) => {
                setContentJson(value.json)
                setContentHtml(value.html)
                if (editor) {
                  setEditorTarget(getInkwiseEditorTarget(editor))
                }
              }}
              focusMode={focusModeEnabled}
              className={cn('min-h-[65vh] border-0 shadow-none', focusModeEnabled && 'min-h-0 flex-1')}
            />

            <div className={cn('rounded-2xl px-4 py-3 text-xs', focusModeEnabled ? 'hidden' : 'bg-slate-50 text-slate-500')}>
              {predictionLoading
                ? 'Inkwise is drafting the next suggestion...'
                : predictionState?.grounded
                ? `Press Tab to accept the grounded inline prediction. Using ${predictionState.evidence.length} evidence ${predictionState.evidence.length === 1 ? 'segment' : 'segments'}.`
                : 'Press Tab to accept inline predictions when they appear.'}
            </div>

            {predictionState?.grounded && predictionState.evidence.length ? (
              <div className={cn('rounded-2xl border px-4 py-3', focusModeEnabled ? 'border-emerald-200/50 bg-emerald-100/15 text-white shadow-lg backdrop-blur-xl' : 'border-emerald-200 bg-emerald-50/50')}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Prediction Evidence</div>
                <InkwiseCitationBubbles citations={predictionState.evidence} onSheetOpenChange={onCitationSheetOpenChange} />
              </div>
            ) : null}
          </div>
        </section>

        <aside
            className={cn(
              'rounded-3xl border bg-white shadow-sm transition-all duration-200 xl:sticky xl:top-28 xl:self-start',
              sidebarOpen ? 'w-full xl:w-[25rem]' : 'w-full xl:w-[5.5rem]',
              focusModeEnabled && 'hidden'
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-3">
              <div className={cn('min-w-0', !sidebarOpen && 'xl:hidden')}>
                <div className="text-sm font-semibold text-slate-900">Sidebar</div>
                <div className="text-xs text-slate-500">AI Chat and document references</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setSidebarOpen((value) => !value)}
                aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>

            {sidebarOpen ? (
              <Tabs value={sidebarTab} onValueChange={(value) => setSidebarTab(value as 'chat' | 'references' | 'review')} className="flex h-full min-h-[32rem] flex-col">
              <div className="border-b px-3 py-3">
                <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100">
                  <TabsTrigger value="chat" className="rounded-xl">
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    AI Chat
                  </TabsTrigger>
                  <TabsTrigger value="references" className="rounded-xl">
                    <LibraryBig className="mr-2 h-4 w-4" />
                    References
                  </TabsTrigger>
                  <TabsTrigger value="review" className="rounded-xl">
                    <Wand2 className="mr-2 h-4 w-4" />
                    Review
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col px-3 pb-3">
                <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl bg-slate-50 p-3">
                  <div className="max-h-28 overflow-y-auto rounded-2xl border bg-white">
                    <div className="flex flex-wrap gap-2 p-3 pr-4">
                      {(threadsQuery.data?.threads ?? []).map((thread) => (
                        <div key={thread.id} className="group relative">
                          <Button
                            variant={selectedThreadId === thread.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedThreadId(thread.id)}
                            className="pr-7"
                          >
                            {thread.title || 'New chat'}
                          </Button>
                          <button
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm('Delete this thread and all its messages?')) {
                                deleteThread.mutate(thread.id)
                              }
                            }}
                            disabled={deleteThread.isPending}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => createThread.mutate()} disabled={createThread.isPending}>
                        <MessageSquarePlus className="mr-2 h-4 w-4" />
                        New thread
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="min-h-0 flex-1 rounded-2xl border bg-white">
                    <div className="space-y-3 p-4">
                      {renderedMessages.map((message) => (
                        <div key={message.id} className={`rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'border bg-white' : 'bg-slate-900 text-white'}`}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide opacity-70">
                            <span>{message.role}</span>
                            {message.role === 'assistant' && message.id === latestAssistantMessageId ? (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => retryChat.mutate({ messageId: message.id, freshRetrieval: true })}
                                  disabled={retryChat.isPending || sendChat.isPending}
                                >
                                  Retry
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {message.role === 'assistant' ? (
                            <InkwiseMarkdownView
                              markdown={messageDisplayMarkdown(message)}
                              citations={messageCitations(message)}
                              renderInlineCitations
                              className={assistantMarkdownClassName}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          )}
                          {message.role === 'assistant' ? (
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              {(messageAttemptId(message) || messageRetrievalRunId(message)) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => setChatDebugTarget({ attemptId: messageAttemptId(message), retrievalRunId: messageRetrievalRunId(message) })}
                                >
                                  Debug
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => copyAssistantMessage(message)}
                              >
                                Copy
                              </Button>
                              {activeDraftSelection ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => void insertAssistantMessage(message, 'replace')}
                                  disabled={Boolean(chatInsertKey)}
                                >
                                  {chatInsertKey === `${message.id}:replace` ? 'Replacing...' : 'Replace selection'}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => void insertAssistantMessage(message, primaryChatInsertMode)}
                                disabled={Boolean(chatInsertKey)}
                              >
                                {chatInsertKey === `${message.id}:${primaryChatInsertMode}` ? 'Inserting...' : primaryChatInsertLabel}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}

                      {streamState ? (
                        <div className="rounded-2xl border bg-white p-3 text-sm">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">assistant</div>
                          {streamState.text ? (
                            <InkwiseMarkdownView
                              markdown={streamState.contentWithCitations || streamState.text}
                              citations={streamState.citations}
                              renderInlineCitations
                              className={assistantMarkdownClassName}
                            />
                          ) : (
                            <div className="text-slate-500">Thinking...</div>
                          )}
                          {streamState.debugTimeline?.length ? (
                            <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Backend debug</div>
                              <div className="mt-2 space-y-2">
                                {streamState.debugTimeline.map((entry) => (
                                  <div key={entry.stage} className="flex items-start justify-between gap-3 text-xs text-slate-600">
                                    <div>
                                      <div className="font-medium text-slate-700">{entry.label}</div>
                                      <div>{entry.status}</div>
                                    </div>
                                    <div className="whitespace-nowrap text-slate-500">{typeof entry.duration_ms === 'number' ? `${entry.duration_ms} ms` : ''}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : !renderedMessages.length ? (
                        <div className="rounded-2xl border border-dashed bg-white p-4 text-sm text-slate-500">
                          Waiting for your first question.
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>

                  <div className="space-y-2">
                    <Textarea
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      placeholder="Ask a grounded question about this draft or your bound sources..."
                      className="min-h-[110px] bg-white"
                    />
                    {activeDraftSelection ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
                        Draft selection attached for context{draftSelectionLabel ? `: ${draftSelectionLabel}` : '.'}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">Chat references</div>
                          <div className="text-xs text-slate-500">
                            {readyChatSources.length
                              ? `${selectedChatSourceIds.length} of ${readyChatSources.length} ready bound references selected`
                              : boundSources.length
                                ? 'No bound references are ready for grounded chat yet'
                                : 'Bind references from the References tab to ground this chat'}
                          </div>
                        </div>
                        {readyChatSources.length ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setChatSourceChecked(Object.fromEntries(readyChatSources.map((item) => [item.source.id, true])))}
                              disabled={sendChat.isPending}
                            >
                              Select All
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setChatSourceChecked(Object.fromEntries(readyChatSources.map((item) => [item.source.id, false])))}
                              disabled={sendChat.isPending}
                            >
                              None
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {boundSources.length ? (
                        <div className="mt-3 grid max-h-40 gap-2 overflow-auto">
                          {boundSources.map((item) => (
                            <label
                              key={item.binding_id}
                              className={cn('flex items-center gap-3 text-sm', item.grounded_chat_ready ? 'text-slate-700' : 'text-slate-400')}
                            >
                              <Checkbox
                                checked={chatSourceChecked[item.source.id] ?? item.grounded_chat_ready}
                                disabled={!item.grounded_chat_ready || sendChat.isPending}
                                onCheckedChange={(checked) => {
                                  setChatSourceChecked((prev) => ({ ...prev, [item.source.id]: Boolean(checked) }))
                                }}
                              />
                              <span>{item.source.title}</span>
                              {!item.grounded_chat_ready ? <span className="text-xs">({item.grounded_chat_reason || 'Not ready'})</span> : null}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {!readyChatSources.length ? (
                      <div className="text-xs text-amber-700">
                        Grounded chat needs at least one ready bound reference. Use the References tab to bind and prepare sources.
                      </div>
                    ) : !selectedChatSourceIds.length ? (
                      <div className="text-xs text-amber-700">
                        Select at least one ready reference before sending grounded chat.
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <Button onClick={() => sendChat.mutate()} disabled={sendChat.isPending || !chatInput.trim() || !selectedChatSourceIds.length}>
                        {sendChat.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Send grounded chat
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="references" className="mt-0 min-h-0 flex-1 px-3 pb-3">
                <ScrollArea className="h-full rounded-2xl bg-slate-50 p-3">
                  <div className="space-y-5 p-1">
                    <InkwiseSourceImportPanel
                      compact
                      title="Add and bind references"
                      description="Import new references without leaving the write workspace. New references are bound to this document automatically."
                      onImported={async (sources) => {
                        if (!sources.length) return
                        await bindSources.mutateAsync(sources.map((source) => source.id))
                        await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-sources', documentId] })
                      }}
                    />

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Bound to this document</div>
                      <div className="space-y-3">
                        {boundSources.length ? (
                          boundSources.map((binding) => (
                            <div key={binding.binding_id} className="rounded-2xl border bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-slate-900">{binding.source.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {binding.source.original_path ? `${binding.source.original_path} • ` : ''}
                                    {binding.grounded_chat_ready ? 'Ready for grounding' : binding.grounded_chat_reason || 'Not ready yet'}
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => unbindSources.mutate([binding.source.id])}>
                                  <Unplug className="mr-2 h-4 w-4" />
                                  Unbind
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed bg-white p-4 text-sm text-slate-500">
                            No sources are bound yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Available library sources</div>
                      <div className="space-y-3">
                        {availableSources.length ? (
                          availableSources.map((source) => (
                            <div key={source.id} className="rounded-2xl border bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-slate-900">{source.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {source.original_path ? `${source.original_path} • ` : ''}
                                    {source.status} • {new Date(source.updated_at).toLocaleString()}
                                  </div>
                                </div>
                                <Button size="sm" onClick={() => bindSources.mutate([source.id])}>
                                  Bind
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed bg-white p-4 text-sm text-slate-500">
                            Everything in your source library is already bound to this document.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="review" className="mt-0 min-h-0 flex-1 px-3 pb-3">
                <ScrollArea className="h-full rounded-2xl bg-slate-50 p-3">
                  <div className="space-y-5 p-1">
                    <div className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">Tracked changes</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {trackChangesEnabled ? 'New edits are being marked.' : 'Turn on track changes in the editor toolbar to mark edits.'}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{pendingChangeCount} pending</div>
                      </div>

                      {reviewState.changes.length ? (
                        <>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleRejectAllChanges}>
                              Reject all
                            </Button>
                            <Button size="sm" onClick={handleAcceptAllChanges}>
                              Accept all
                            </Button>
                          </div>
                          <div className="mt-4 space-y-3">
                            {reviewState.changes.map((change) => (
                              <div key={change.id} className="rounded-2xl border bg-slate-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">{change.kind === 'deletion' ? 'Deletion' : 'Insertion'}</div>
                                    <div className="mt-1 text-xs text-slate-500">{change.createdAt ? new Date(change.createdAt).toLocaleString() : 'Pending review'}</div>
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => focusEditorRange(change.from, change.to)}>
                                    Jump to change
                                  </Button>
                                </div>
                                <div className="mt-3 rounded-xl border bg-white px-3 py-2 text-sm text-slate-700">{change.text || 'No text captured.'}</div>
                                <div className="mt-3 flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleRejectChange(change.id)}>
                                    Reject
                                  </Button>
                                  <Button size="sm" onClick={() => handleAcceptChange(change.id)}>
                                    Accept
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                          No tracked changes yet.
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">Comments</div>
                          <div className="mt-1 text-xs text-slate-500">Select text in the editor and use the Comment action in the toolbar.</div>
                        </div>
                        <div className="text-xs text-slate-500">{pendingCommentCount} open</div>
                      </div>

                      {reviewState.comments.length ? (
                        <div className="mt-4 space-y-3">
                          {reviewState.comments.map((comment) => (
                            <div key={comment.id} className={cn('rounded-2xl border p-3', comment.resolved ? 'bg-slate-50' : 'bg-amber-50/50')}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{comment.resolved ? 'Resolved comment' : 'Open comment'}</div>
                                  <div className="mt-1 text-xs text-slate-500">{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : 'Just added'}</div>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => focusEditorRange(comment.from, comment.to)}>
                                  Jump to text
                                </Button>
                              </div>
                              <div className="mt-3 rounded-xl border bg-white px-3 py-2 text-sm text-slate-700">{comment.body}</div>
                              <div className="mt-2 text-xs text-slate-500">Quoted text: {comment.quote || 'No quoted text available.'}</div>
                              <div className="mt-3 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCommentResolvedChange(comment.id, !comment.resolved)}
                                >
                                  {comment.resolved ? 'Reopen' : 'Resolve'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleCommentDelete(comment.id)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                          No comments yet.
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-col gap-2 p-3 xl:items-center xl:justify-start xl:py-4">
              <Button
                variant={sidebarTab === 'chat' ? 'default' : 'outline'}
                size="icon"
                className="h-11 w-11 rounded-2xl"
                onClick={() => {
                  setSidebarTab('chat')
                  setSidebarOpen(true)
                }}
                aria-label="Open AI Chat sidebar"
              >
                <MessageSquareText className="h-4 w-4" />
              </Button>
              <Button
                variant={sidebarTab === 'references' ? 'default' : 'outline'}
                size="icon"
                className="h-11 w-11 rounded-2xl"
                onClick={() => {
                  setSidebarTab('references')
                  setSidebarOpen(true)
                }}
                aria-label="Open References sidebar"
              >
                <LibraryBig className="h-4 w-4" />
              </Button>
              <Button
                variant={sidebarTab === 'review' ? 'default' : 'outline'}
                size="icon"
                className="h-11 w-11 rounded-2xl"
                onClick={() => {
                  setSidebarTab('review')
                  setSidebarOpen(true)
                }}
                aria-label="Open Review sidebar"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={driveExportOpen} onOpenChange={setDriveExportOpen}>
        <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => { if (isDrivePickerOpen) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Export To Google Drive</DialogTitle>
            <DialogDescription>Create a new PDF or DOCX file in Google Drive. Leave the folder unset to export to the root of My Drive.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <GoogleDriveFolderPicker
              selectedFolder={driveExportFolder}
              onFolderSelected={(folder) => setDriveExportFolder(folder)}
              buttonText={driveExportFolder ? `Folder: ${driveExportFolder.name}` : 'Select Destination Folder'}
              onPickerStateChange={setIsDrivePickerOpen}
            />
            <div className="text-xs text-slate-500">
              Each export creates a new Drive file. Existing Drive exports are not overwritten.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriveExportOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={() => exportToDrive.mutate('pdf')} disabled={exportToDrive.isPending}>
              {exportToDrive.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
              Export PDF
            </Button>
            <Button onClick={() => exportToDrive.mutate('docx')} disabled={exportToDrive.isPending}>
              {exportToDrive.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
              Export DOCX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Document Settings</DialogTitle>
            <DialogDescription>
              Configure document-level prompt engineering for this draft. These instructions guide grounded writing tools and predictions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="inkwise-settings-title">Document title</Label>
              <Input
                id="inkwise-settings-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Untitled document"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-settings-guidance">Document guidance</Label>
              <Textarea
                id="inkwise-settings-guidance"
                value={initPrompt}
                onChange={(event) => setInitPrompt(event.target.value)}
                placeholder="Describe the purpose, audience, tone, or drafting constraints for this document."
                className="min-h-[180px]"
              />
              <div className="text-xs text-slate-500">
                Example: Draft a professional memorandum for a CPA audience, keep the tone concise, and support factual claims with bound references.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inkwise-settings-citation-style">Citation style</Label>
              <Select value={citationStyle} onValueChange={(value) => setCitationStyle(value as InkwiseCitationStyle)}>
                <SelectTrigger id="inkwise-settings-citation-style">
                  <SelectValue placeholder="Select a citation style" />
                </SelectTrigger>
                <SelectContent>
                  {INKWISE_CITATION_STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500">
                Changing the style automatically reformats semantic inline citations, footnotes, and endnotes in this document.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                saveDocument.mutate()
                setSettingsOpen(false)
              }}
              disabled={saveDocument.isPending || version == null}
            >
              {saveDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InkwiseChatDebugSheet
        open={Boolean(chatDebugTarget)}
        onOpenChange={(open) => {
          if (!open) setChatDebugTarget(null)
        }}
        attemptId={chatDebugTarget?.attemptId}
        retrievalRunId={chatDebugTarget?.retrievalRunId}
      />

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl">
          <div className="flex h-full flex-col gap-4">
            <SheetHeader>
              <SheetTitle>Version History</SheetTitle>
              <SheetDescription>Review older document revisions and restore a prior draft state.</SheetDescription>
            </SheetHeader>

            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <ScrollArea className="rounded-xl border">
                <div className="space-y-2 p-3">
                  {revisionsQuery.isLoading ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading revisions...
                    </div>
                  ) : revisionsQuery.data?.items.length ? (
                    revisionsQuery.data.items.map((revision) => (
                      <button
                        key={revision.id}
                        type="button"
                        onClick={() => setSelectedRevisionId(revision.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${selectedRevisionId === revision.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">Revision {revision.revision_number}</div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                            {formatRevisionSourceKind(revision.source_kind)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{new Date(revision.created_at).toLocaleString()}</div>
                        <div className="mt-2 truncate text-sm text-slate-700">{revision.title || 'Untitled document'}</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-slate-500">No revisions yet.</div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex min-h-0 flex-col rounded-xl border">
                <div className="border-b p-4">
                  {selectedRevision ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">Revision {selectedRevision.revision_number}</div>
                          <div className="mt-1 text-xs text-slate-500">Document version {selectedRevision.document_version} • {new Date(selectedRevision.created_at).toLocaleString()}</div>
                        </div>
                        <Button
                          onClick={() => restoreRevision.mutate(selectedRevision.id)}
                          disabled={restoreRevision.isPending}
                        >
                          {restoreRevision.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Restore
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</div>
                          <div className="mt-1 text-sm text-slate-700">{selectedRevision.title || 'Untitled document'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guidance</div>
                          <div className="mt-1 text-sm text-slate-700">{selectedRevision.init_prompt || 'No guidance'}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500">Select a revision to preview it.</div>
                  )}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diff Preview</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {comparisonRevision
                        ? `Compared with revision ${comparisonRevision.revision_number}`
                        : 'No earlier revision is available for comparison.'}
                    </div>
                    <div className="mt-3 space-y-3">
                      {revisionDiffBlocks.length ? (
                        revisionDiffBlocks.map((block, index) => (
                          <div
                            key={`${block.type}-${index}`}
                            className={cn(
                              'whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm',
                              block.type === 'insert' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                              block.type === 'delete' && 'border-rose-200 bg-rose-50 text-rose-900 line-through',
                              block.type === 'equal' && 'border-slate-200 bg-slate-50 text-slate-700'
                            )}
                          >
                            {block.text}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                          {selectedRevisionText || 'No document content stored for this revision.'}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function formatRevisionSourceKind(sourceKind: string): string {
  if (sourceKind === 'create') return 'created'
  if (sourceKind === 'restore') return 'restored'
  if (sourceKind === 'save') return 'saved'
  return sourceKind || 'revision'
}

function stripHtml(value?: string | null): string {
  const html = (value || '').trim()
  if (!html) return ''
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|blockquote|h1|h2|h3|h4|h5|h6)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getPredictionContext(editor: TiptapEditor): PredictionContext {
  const { state } = editor
  const { from } = state.selection
  const blockStart = state.selection.$from.start()
  const blockEnd = state.selection.$from.end()
  const beforeCursorInBlock = state.doc.textBetween(blockStart, from, '\n', '\n')
  const afterCursorInBlock = state.doc.textBetween(from, blockEnd, '\n', '\n')

  return {
    beforeText: state.doc.textBetween(0, from, '\n', '\n'),
    afterText: state.doc.textBetween(from, state.doc.content.size, '\n', '\n'),
    beforeCursorInBlock,
    afterCursorInBlock,
  }
}

function buildPredictionRequest(context: PredictionContext): InkwisePredictionRequest {
  return {
    before_text: context.beforeText.slice(-MAX_PREDICTION_BEFORE_TEXT),
    after_text: context.afterText.slice(0, MAX_PREDICTION_AFTER_TEXT) || undefined,
    current_block_text:
      truncateAroundCursor(context.beforeCursorInBlock, context.afterCursorInBlock, MAX_PREDICTION_BLOCK_TEXT) || undefined,
  }
}

function truncateAroundCursor(beforeCursor: string, afterCursor: string, maxChars: number): string {
  const safeMaxChars = Math.max(1, maxChars)
  const fullText = `${beforeCursor}${afterCursor}`
  if (fullText.length <= safeMaxChars) return fullText

  const initialHeadBudget = Math.min(beforeCursor.length, Math.ceil(safeMaxChars / 2))
  const initialTailBudget = Math.min(afterCursor.length, safeMaxChars - initialHeadBudget)
  const remainingBudget = Math.max(0, safeMaxChars - initialHeadBudget - initialTailBudget)
  const extraHeadBudget = Math.min(beforeCursor.length - initialHeadBudget, remainingBudget)
  const finalHeadBudget = initialHeadBudget + extraHeadBudget
  const finalTailBudget = Math.min(afterCursor.length, safeMaxChars - finalHeadBudget)

  return `${beforeCursor.slice(-finalHeadBudget)}${afterCursor.slice(0, finalTailBudget)}`
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function logPredictionError(error: unknown): void {
  if (process.env.NODE_ENV === 'production' || isAbortError(error)) return

  if (error instanceof ApiError) {
    console.warn('Inkwise prediction request failed', {
      status: error.status,
      message: error.message,
      body: error.body,
    })
    return
  }

  console.warn('Inkwise prediction request failed', error)
}
