'use client'

import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, History, Loader2, MessageSquarePlus, Save, Sparkles, Unplug, Wand2 } from 'lucide-react'

import { InkwiseEditor } from '@/components/inkwise/inkwise-editor'
import { InlineWritingTools } from '@/components/inkwise/inline-writing-tools'
import { InkwiseCitationBubbles } from '@/components/inkwise/citation-bubbles'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useInkwiseChatMessages,
  useInkwiseChatThreads,
  useInkwiseDocument,
  useInkwiseDocumentRevisions,
  useInkwiseDocumentSources,
  useInkwiseSources,
} from '@/hooks/useInkwise'
import { apiClient, InkwiseChatMessage, InkwiseCitation, InkwiseDocumentRevision, InkwisePredictionResponse, InkwiseSseEvent } from '@/lib/api'

type StreamState = {
  text: string
  retrievalRunId?: string
  citations?: InkwiseCitation[]
  attemptId?: string
}

type PredictionState = {
  text: string
  grounded: boolean
  evidence: InkwiseCitation[]
}

function messageCitations(message: InkwiseChatMessage): InkwiseCitation[] {
  const raw = message.citations_json?.citations
  return Array.isArray(raw) ? raw : []
}

function normalizePredictionState(prediction: InkwisePredictionResponse): PredictionState | null {
  const text = (prediction?.suggestion_text || '').trim()
  if (!text) return null
  return {
    text,
    grounded: Boolean(prediction.grounded),
    evidence: Array.isArray(prediction.evidence) ? prediction.evidence : [],
  }
}

export default function InkwiseDocumentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const documentId = params.id

  const documentQuery = useInkwiseDocument(documentId)
  const sourcesQuery = useInkwiseSources(1, 100)
  const bindingsQuery = useInkwiseDocumentSources(documentId)
  const threadsQuery = useInkwiseChatThreads(documentId)
  const revisionsQuery = useInkwiseDocumentRevisions(documentId)

  const [title, setTitle] = useState('')
  const [initPrompt, setInitPrompt] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [contentJson, setContentJson] = useState<JSONContent | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()
  const [chatInput, setChatInput] = useState('')
  const [streamState, setStreamState] = useState<StreamState | null>(null)
  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const [predictionState, setPredictionState] = useState<PredictionState | null>(null)
  const [predictionTick, setPredictionTick] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const predictionTimeoutRef = useRef<number | null>(null)
  const predictionSeqRef = useRef(0)

  useEffect(() => {
    if (!documentQuery.data) return
    setTitle(documentQuery.data.title || 'Untitled document')
    setInitPrompt(documentQuery.data.init_prompt || '')
    setContentHtml(documentQuery.data.content_html || '')
    setContentJson((documentQuery.data.content_json as JSONContent | null) ?? null)
    setVersion(documentQuery.data.version)
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

  const messagesQuery = useInkwiseChatMessages(selectedThreadId)

  const availableSources = useMemo(() => {
    const allSources = sourcesQuery.data?.items ?? []
    const boundIds = new Set((bindingsQuery.data?.sources ?? []).map((item) => item.source.id))
    return allSources.filter((source) => !boundIds.has(source.id))
  }, [sourcesQuery.data, bindingsQuery.data])

  const saveDocument = useMutation({
    mutationFn: async () => {
      if (version == null) throw new Error('Document is not ready yet')
      return apiClient.updateInkwiseDocument(documentId, {
        version,
        title,
        init_prompt: initPrompt,
        content_json: (contentJson as Record<string, any> | null) ?? null,
        content_html: contentHtml,
      })
    },
    onSuccess: async (updated) => {
      setVersion(updated.version)
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'document-revisions', documentId] })
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'documents'] })
      toast({ title: 'Document saved', description: 'Your Inkwise draft is up to date.' })
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
      setTitle(updated.title || 'Untitled document')
      setInitPrompt(updated.init_prompt || '')
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
    mutationFn: () => apiClient.createInkwiseChatThread({ document_id: documentId, title: `${title || 'Draft'} chat` }),
    onSuccess: async (thread) => {
      await queryClient.invalidateQueries({ queryKey: ['inkwise', 'chat-threads', documentId] })
      setSelectedThreadId(thread.id)
    },
    onError: (error: Error) => {
      toast({ title: 'Could not create thread', description: error.message, variant: 'destructive' })
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
        const created = await apiClient.createInkwiseChatThread({ document_id: documentId, title: `${title || 'Draft'} chat` })
        threadId = created.id
        setSelectedThreadId(created.id)
      }

      setStreamState({ text: '' })
      await apiClient.streamInkwiseChatMessage(
        threadId,
        { content: chatInput },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            setStreamState((current) => ({ ...(current ?? { text: '' }), text: `${current?.text ?? ''}${event.data?.text ?? ''}` }))
          }
          if (event.event === 'meta' && event.data?.citations) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
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
          if (event.event === 'meta' && event.data?.citations) {
            setStreamState((current) => ({
              ...(current ?? { text: '' }),
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
    mutationFn: async () => {
      const selection = contentHtml.trim()
      if (!selection) throw new Error('Add some document content before using a writing tool')

      let output = ''
      await apiClient.streamInkwiseWritingTool(
        {
          action: 'improve',
          document_id: documentId,
          selection_text: selection,
          surrounding_text: initPrompt,
          instruction: 'Improve this draft while preserving the original intent and structure.',
        },
        (event: InkwiseSseEvent) => {
          if (event.event === 'token') {
            output += event.data?.text ?? ''
          }
        }
      )
      return output
    },
    onSuccess: (output) => {
      if (output.trim()) {
        setContentHtml(output)
        toast({ title: 'Draft refreshed', description: 'The writing tool returned a revised version in the editor.' })
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

  useEffect(() => {
    if (!editor) return

    const onSelection = () => {
      setPredictionTick((value) => value + 1)
    }

    editor.on('selectionUpdate', onSelection)
    return () => {
      editor.off('selectionUpdate', onSelection)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || !documentQuery.data) return
    if (predictionTimeoutRef.current) {
      window.clearTimeout(predictionTimeoutRef.current)
      predictionTimeoutRef.current = null
    }

      const { from, to, empty } = editor.state.selection
      if (!empty) {
      setPredictionState(null)
      return
    }

    const beforeText = editor.state.doc.textBetween(0, from, '\n', '\n').trim()
    const afterText = editor.state.doc.textBetween(to, editor.state.doc.content.size, '\n', '\n').trim()
    const currentBlockText = editor.state.selection.$from.parent.textContent?.trim() || ''

    if (beforeText.length < 20) {
      setPredictionState(null)
      return
    }

    predictionTimeoutRef.current = window.setTimeout(async () => {
      const seq = ++predictionSeqRef.current
      try {
        const prediction = await apiClient.createInkwisePrediction(documentId, {
          before_text: beforeText,
          after_text: afterText || undefined,
          current_block_text: currentBlockText || undefined,
        })
        if (seq === predictionSeqRef.current) {
          setPredictionState(normalizePredictionState(prediction))
        }
      } catch {
        if (seq === predictionSeqRef.current) {
          setPredictionState(null)
        }
      }
    }, 900)

    return () => {
      if (predictionTimeoutRef.current) {
        window.clearTimeout(predictionTimeoutRef.current)
        predictionTimeoutRef.current = null
      }
    }
  }, [editor, documentId, documentQuery.data, predictionTick, contentHtml])

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
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle>Document</CardTitle>
              <CardDescription>Use a practical plain-text workspace while the richer Inkwise editor is being ported.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleExport('pdf')}>
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                Version history
              </Button>
              <Button variant="outline" onClick={() => handleExport('docx')}>
                <Download className="mr-2 h-4 w-4" />
                DOCX
              </Button>
              <Button variant="outline" onClick={() => deleteDocument.mutate()} disabled={deleteDocument.isPending}>
                Delete
              </Button>
              <Button onClick={() => saveDocument.mutate()} disabled={saveDocument.isPending || version == null}>
                {saveDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inkwise-title">Title</Label>
                <Input id="inkwise-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inkwise-guidance">Draft guidance</Label>
                <Input id="inkwise-guidance" value={initPrompt} onChange={(event) => setInitPrompt(event.target.value)} placeholder="Optional writing purpose or tone" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="inkwise-content">Draft content</Label>
                <Button variant="outline" size="sm" onClick={() => runWritingTool.mutate()} disabled={runWritingTool.isPending}>
                  {runWritingTool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Improve draft
                </Button>
              </div>
              <InkwiseEditor
                contentJson={contentJson}
                contentHtml={contentHtml}
                placeholder="Start writing here..."
                onEditor={setEditor}
                predictionText={predictionState?.text || ''}
                onAcceptPrediction={() => {
                  if (!editor || !predictionState?.text) return
                  editor.chain().focus().insertContent(predictionState.text).run()
                  setPredictionState(null)
                  setPredictionTick((value) => value + 1)
                }}
                onDismissPrediction={() => setPredictionState(null)}
                onBlur={() => saveDocument.mutate()}
                onChange={(value) => {
                  setContentJson(value.json)
                  setContentHtml(value.html)
                  setPredictionTick((tick) => tick + 1)
                }}
              />
              <div className="text-xs text-slate-500">
                {predictionState?.grounded
                  ? `Press Tab to accept the grounded inline prediction. Using ${predictionState.evidence.length} evidence ${predictionState.evidence.length === 1 ? 'segment' : 'segments'}.`
                  : 'Press Tab to accept inline predictions when they appear.'}
              </div>
              {predictionState?.grounded && predictionState.evidence.length ? (
                <div className="pt-1">
                  <InkwiseCitationBubbles citations={predictionState.evidence} />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inline Tools</CardTitle>
            <CardDescription>Select text in the editor to open rewrite tools grounded to the bound source set.</CardDescription>
          </CardHeader>
          <CardContent>
            <InlineWritingTools editor={editor} documentId={documentId} boundSources={bindingsQuery.data?.sources ?? []} />
            <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
              Highlight a passage in the editor to open Improve, Concise, Longer, and Custom rewrite actions.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grounded Chat</CardTitle>
            <CardDescription>Ask questions against the sources bound to this document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(threadsQuery.data?.threads ?? []).map((thread) => (
                <Button
                  key={thread.id}
                  variant={selectedThreadId === thread.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  {thread.title || 'Grounded thread'}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => createThread.mutate()} disabled={createThread.isPending}>
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                New thread
              </Button>
            </div>

            <ScrollArea className="h-[360px] rounded-xl border bg-slate-50">
              <div className="space-y-3 p-4">
                {renderedMessages.map((message) => (
                  <div key={message.id} className={`rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'bg-white border' : 'bg-slate-900 text-white'}`}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide opacity-70">
                      <span>{message.role}</span>
                      {message.role === 'assistant' && message.id === latestAssistantMessageId ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => retryChat.mutate({ messageId: message.id, freshRetrieval: false })}
                            disabled={retryChat.isPending || sendChat.isPending}
                          >
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => retryChat.mutate({ messageId: message.id, freshRetrieval: true })}
                            disabled={retryChat.isPending || sendChat.isPending}
                          >
                            Fresh evidence
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    {messageCitations(message).length ? (
                      <div className="mt-3">
                        <InkwiseCitationBubbles citations={messageCitations(message)} />
                      </div>
                    ) : null}
                  </div>
                ))}

                {streamState ? (
                  <div className="rounded-2xl border bg-white p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">assistant</div>
                    <div className="whitespace-pre-wrap">{streamState.text || 'Thinking...'}</div>
                    {streamState.citations?.length ? (
                      <div className="mt-3">
                        <InkwiseCitationBubbles citations={streamState.citations} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <div className="space-y-2">
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask a grounded question about this draft or your bound sources..."
                className="min-h-[110px]"
              />
              <div className="flex justify-end">
                <Button onClick={() => sendChat.mutate()} disabled={sendChat.isPending || !chatInput.trim()}>
                  {sendChat.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Send grounded chat
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bound Sources</CardTitle>
            <CardDescription>Only completed sources with retrieval segments and active embeddings are used for grounding.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(bindingsQuery.data?.sources ?? []).length ? (
              bindingsQuery.data?.sources.map((binding) => (
                <div key={binding.binding_id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{binding.source.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
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
              <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                No sources are bound yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available Library Sources</CardTitle>
            <CardDescription>Bind references here so retrieval, chat, and writing tools can use them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableSources.length ? (
              availableSources.map((source) => (
                <div key={source.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{source.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{source.status} • {new Date(source.updated_at).toLocaleString()}</div>
                    </div>
                    <Button size="sm" onClick={() => bindSources.mutate([source.id])}>
                      Bind
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                Everything in your source library is already bound to this document.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot Preview</div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="whitespace-pre-wrap">{stripHtml(selectedRevision?.content_html) || 'No document content stored for this revision.'}</div>
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
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
