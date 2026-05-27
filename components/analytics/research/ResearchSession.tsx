'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  Loader2,
  MessageSquare,
  Scale,
  Send,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'
import { useStreamingChat } from '@/lib/analytics/useStreamingChat'
import {
  useAnalyticsResearchSession,
  useUpdateAnalyticsResearchSession,
  type ResearchBot,
} from '@/hooks/useAnalyticsResearchSessions'
import { parseCSV, parseDocx, parseExcel, parsePDF } from '@/lib/analytics/fileParser'
import { exportCitations, exportTranscript, type ChatTranscriptFormat } from '@/lib/analytics/exportChat'
import type { AnalyticsChatMessage, AnalyticsUploadedDoc } from '@/lib/analytics/types'
import type { SelectedResearchClient } from './ResearchBot'

const MAX_DOCS = 50
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPT = '.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.jpg,.jpeg,.png'

type OutputStyle = 'Q&A' | 'Summary' | 'Memo'

interface ResearchSessionProps {
  bot: ResearchBot
  client: SelectedResearchClient
  /** Existing session id to resume, or null for a fresh session. */
  sessionId: string | null
  onBack: () => void
}

function buildDocumentContext(docs: AnalyticsUploadedDoc[]): string | null {
  if (docs.length === 0) return null
  return docs
    .map(
      (d) =>
        `--- Document: ${d.name} ---\n${d.text || ''}\nExtracted Data: ${JSON.stringify(
          d.extractedData ?? {},
        )}`,
    )
    .join('\n\n')
}

async function extractText(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.pdf')) return parsePDF(file)
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return parseDocx(file)
  if (lower.endsWith('.csv')) return JSON.stringify(await parseCSV(file))
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return JSON.stringify(await parseExcel(file))
  if (/\.(jpe?g|png)$/.test(lower)) return `Image document: ${file.name} (no text extracted)`
  return file.text()
}

function getSuggestedPrompts(bot: ResearchBot, docs: AnalyticsUploadedDoc[]): string[] {
  if (docs.length === 0) {
    return bot === 'irs'
      ? [
          'What are the current Section 179 limits and phase-out thresholds?',
          'Explain the MACRS depreciation rules for 5-year property',
          'Summarize the rules for the qualified business income deduction (§199A)',
        ]
      : [
          'Explain the five-step revenue recognition model under ASC 606',
          'What are the ASC 842 lease classification criteria?',
          'What is the goodwill impairment test under ASC 350?',
        ]
  }
  const names = docs.map((d) => d.name.toLowerCase())
  if (bot === 'irs') {
    if (names.some((n) => n.includes('1040') || n.includes('1120'))) {
      return [
        'Summarize the key items on this return',
        'Are there any red flags for audit risk?',
        'What deductions could be optimized?',
      ]
    }
    if (names.some((n) => n.includes('notice'))) {
      return [
        'Explain what this notice means and what action is required',
        'What is the deadline to respond?',
        'Draft a response to this notice',
      ]
    }
  } else if (names.some((n) => n.includes('lease') || n.includes('contract') || n.includes('agreement'))) {
    return [
      'How should this contract be accounted for under ASC 606?',
      'Is this a lease under ASC 842 — operating or finance?',
      'Identify the performance obligations in this arrangement',
    ]
  }
  return [
    'Summarize the key items in these documents',
    'Are there any accounting/tax issues I should be aware of?',
    'What are the recommended next steps?',
  ]
}

export function ResearchSession({ bot, client, sessionId, onBack }: ResearchSessionProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const updateSession = useUpdateAnalyticsResearchSession()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const seededRef = useRef(false)

  const [input, setInput] = useState('')
  const [outputStyle, setOutputStyle] = useState<OutputStyle>('Q&A')
  const [uploadedDocs, setUploadedDocs] = useState<AnalyticsUploadedDoc[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const greeting = useMemo<AnalyticsChatMessage>(() => {
    const suffix = client.id === 'general' ? '' : ` for **${client.name}**`
    return {
      role: 'model',
      content:
        bot === 'irs'
          ? `Hello! I'm your IRS Research Assistant. I've started a new session${suffix}. Upload tax documents or ask a question to begin.`
          : `Hello! I'm your GAAP research assistant. I've started a new session${suffix}. Upload financial documents or ask an accounting-standards question to begin.`,
    }
  }, [bot, client.id, client.name])

  const onSession = useCallback(() => {
    // A new session was created (or a turn appended) server-side — refresh the
    // history list shown on the landing view.
    queryClient.invalidateQueries({ queryKey: ['analytics', 'research-sessions', bot] })
  }, [queryClient, bot])

  const onError = useCallback(
    (message: string) => toast({ title: 'Research error', description: message, variant: 'destructive' }),
    [toast],
  )

  const {
    messages,
    isStreaming,
    sendMessage,
    setMessages,
    setSession,
    sessionId: activeSessionId,
    title: activeTitle,
  } = useStreamingChat({
    initialMessages: sessionId ? [] : [greeting],
    onSession,
    onError,
  })

  // Resume an existing session: seed transcript + documents once it loads.
  const { data: loaded, isLoading: loadingSession } = useAnalyticsResearchSession(bot, sessionId)
  useEffect(() => {
    if (sessionId && loaded && !seededRef.current) {
      seededRef.current = true
      setMessages(loaded.messages ?? [])
      setSession(loaded.id, loaded.title ?? null)
      setUploadedDocs(loaded.uploadedDocs ?? [])
    }
  }, [sessionId, loaded, setMessages, setSession])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const documentContext = useMemo(() => buildDocumentContext(uploadedDocs), [uploadedDocs])

  const persistDocs = useCallback(
    async (docs: AnalyticsUploadedDoc[]) => {
      // Persist immediately once a session exists; new sessions capture docs on
      // the first streamed turn. Best-effort — viewers lack write access.
      if (!activeSessionId) return
      try {
        await updateSession.mutateAsync({ bot, sessionId: activeSessionId, data: { uploadedDocs: docs } })
      } catch {
        /* non-fatal: docs still ride along with the next streamed message */
      }
    },
    [activeSessionId, bot, updateSession],
  )

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return
    if (uploadedDocs.length + files.length > MAX_DOCS) {
      toast({ title: `Maximum ${MAX_DOCS} documents per session.`, variant: 'destructive' })
      return
    }
    setIsUploading(true)
    try {
      const docType = bot === 'irs' ? 'IRS' : 'GAAP'
      const added: AnalyticsUploadedDoc[] = []
      const oversized: string[] = []
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          oversized.push(file.name)
          continue
        }
        let text = ''
        try {
          text = await extractText(file)
        } catch {
          text = `Contents of ${file.name}`
        }
        let summary = ''
        let extractedData: Record<string, unknown> | undefined
        try {
          const res = await apiClient.extractAnalyticsDocument({ documentText: text, type: docType })
          summary = res.summary
          extractedData = res.extractedData
        } catch {
          summary = `Detected ${bot === 'irs' ? 'tax' : 'financial'} document. Could not extract details.`
        }
        added.push({ id: crypto.randomUUID(), name: file.name, text, summary, extractedData })
      }
      if (oversized.length > 0) {
        toast({
          title: 'Some files were skipped',
          description: `Exceeded the 25MB limit: ${oversized.join(', ')}`,
          variant: 'destructive',
        })
      }
      if (added.length === 0) return
      const next = [...uploadedDocs, ...added]
      setUploadedDocs(next)
      await persistDocs(next)
      toast({ title: `Added ${added.length} document${added.length === 1 ? '' : 's'} to context` })
    } finally {
      setIsUploading(false)
    }
  }

  const removeDoc = async (docId: string) => {
    const next = uploadedDocs.filter((d) => d.id !== docId)
    setUploadedDocs(next)
    await persistDocs(next)
  }

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim()
    if (!text || isStreaming) return
    setInput('')
    const backendStyle =
      outputStyle === 'Memo'
        ? bot === 'irs'
          ? 'Tax Research Memo'
          : 'Technical Accounting Memo'
        : outputStyle
    await sendMessage(text, {
      kind: 'research',
      bot,
      outputStyle: backendStyle,
      documentContext,
      clientId: client.id === 'general' ? null : client.id,
      sessionId: activeSessionId,
      uploadedDocs,
    })
  }

  const copyMessage = (content: string) => {
    void navigator.clipboard.writeText(content)
    toast({ title: 'Copied to clipboard' })
  }

  const runExport = (format: ChatTranscriptFormat) => {
    exportTranscript(messages, format, {
      botLabel: `${bot.toUpperCase()} BOT`,
      filenamePrefix: `${bot.toUpperCase()}_Research`,
    }).catch(() => toast({ title: 'Export failed', variant: 'destructive' }))
  }

  const lastMessage = messages[messages.length - 1]
  const showSuggestions =
    !isStreaming && (messages.length === 1 || lastMessage?.role === 'model')
  const accentBg = bot === 'irs' ? 'bg-rose-600' : 'bg-blue-600'
  const BotIcon = bot === 'irs' ? Scale : BookOpen

  if (sessionId && loadingSession && !seededRef.current) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-foreground-muted">
        <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
        Loading session…
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[520px] flex-col gap-4">
      {/* Session header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to sessions" onClick={onBack}>
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              {activeTitle || 'New research session'}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>
            </h2>
            <p className="flex items-center gap-2 text-sm text-foreground-muted">
              <Users className="size-3.5" aria-hidden />
              {client.name}
              <span className="text-foreground-subtle">•</span>
              {uploadedDocs.length} document{uploadedDocs.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-surface-muted p-1">
            {(['pdf', 'word', 'md'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => runExport(fmt)}
                className="rounded-md px-3 py-1.5 text-xs font-bold text-foreground-muted transition-colors hover:bg-card hover:text-foreground"
              >
                {fmt === 'md' ? 'MD' : fmt === 'word' ? 'Word' : 'PDF'}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCitations(messages, `${bot.toUpperCase()}_Research`).catch(() =>
                toast({ title: 'Export failed', variant: 'destructive' }),
              )
            }
          >
            <BookOpen className="mr-1.5 size-4" aria-hidden />
            Citations
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void processFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="mr-1.5 size-4" aria-hidden />
            Upload
          </Button>
        </div>
      </div>

      {/* Split pane */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Document panel */}
        <div className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted p-4">
            <h3 className="flex items-center gap-2 font-bold text-foreground">
              <FileText className="size-4 text-foreground-muted" aria-hidden />
              Document Context
            </h3>
            <span className="rounded-md bg-surface px-2 py-1 text-xs font-bold text-foreground-muted">
              {uploadedDocs.length}/{MAX_DOCS}
            </span>
          </div>
          <div className="relative flex-1 overflow-y-auto p-4">
            {isUploading && (
              <div className="absolute inset-4 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-card/80 backdrop-blur-sm">
                <Loader2 className="mb-3 size-8 animate-spin text-primary" aria-hidden />
                <p className="font-medium text-foreground">Extracting data…</p>
                <p className="mt-1 text-sm text-foreground-muted">AI is analyzing your documents</p>
              </div>
            )}
            {uploadedDocs.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  void processFiles(Array.from(e.dataTransfer.files))
                }}
                className={cn(
                  'flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-foreground-muted hover:border-primary/40 hover:bg-surface-muted',
                )}
              >
                <Upload className="mb-3 size-8" aria-hidden />
                <p className="font-medium text-foreground">
                  {isDragging ? 'Drop documents here' : 'Drag & drop documents here'}
                </p>
                <p className="mt-1 text-sm">PDF, Excel, Word, CSV, Images (max 25MB)</p>
              </button>
            ) : (
              <div className="space-y-4">
                {uploadedDocs.map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileIcon className="size-4 shrink-0 text-primary" aria-hidden />
                        <p className="truncate text-sm font-bold text-foreground" title={doc.name}>
                          {doc.name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeDoc(doc.id)}
                        className="text-foreground-subtle transition-colors hover:text-destructive"
                        aria-label={`Remove ${doc.name}`}
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                    {doc.summary && (
                      <div className="rounded-lg border border-border bg-card p-3">
                        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground-muted">
                          AI Extraction Summary
                        </p>
                        <p className="whitespace-pre-line text-sm text-foreground-muted">{doc.summary}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted p-4">
            <div className="flex items-center gap-2">
              <div className={cn('flex size-8 items-center justify-center rounded-lg text-white', accentBg)}>
                <BotIcon className="size-4" aria-hidden />
              </div>
              <span className="text-sm font-bold text-foreground">{bot.toUpperCase()} Assistant</span>
            </div>
            <div className="flex items-center rounded-lg bg-surface p-1">
              {(['Q&A', 'Summary', 'Memo'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setOutputStyle(style)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition-all',
                    outputStyle === style
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto p-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex max-w-[95%] gap-3',
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
                )}
              >
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm',
                    msg.role === 'user' ? 'bg-surface-muted text-foreground-muted' : cn('text-white', accentBg),
                  )}
                >
                  {msg.role === 'user' ? <MessageSquare className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
                </div>
                <div
                  className={cn(
                    'rounded-2xl p-4 text-sm leading-relaxed shadow-sm',
                    msg.role === 'user'
                      ? 'rounded-tr-none bg-slate-900 text-white'
                      : 'rounded-tl-none border border-border bg-card text-foreground',
                  )}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-slate-800 prose-pre:text-slate-50">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}

                  {msg.role === 'model' && i > 0 && msg.content && (
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                      <span className="flex items-center gap-1 rounded-md bg-success-soft px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-success">
                        <Sparkles className="size-3" aria-hidden /> High confidence
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyMessage(msg.content)}
                          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:text-primary"
                          title="Copy"
                        >
                          <Copy className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => runExport('word')}
                          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:text-primary"
                          title="Export to Word"
                        >
                          <Download className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && lastMessage?.role === 'model' && lastMessage.content === '' && (
              <div className="mr-auto flex gap-3">
                <div className={cn('flex size-9 items-center justify-center rounded-xl text-white', accentBg)}>
                  <Bot className="size-4" aria-hidden />
                </div>
                <div className="rounded-2xl rounded-tl-none border border-border bg-card p-4 shadow-sm">
                  <div className="flex gap-1.5">
                    <span className="size-2 animate-bounce rounded-full bg-foreground-subtle" />
                    <span className="size-2 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.2s]" />
                    <span className="size-2 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}

            {showSuggestions && (
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground-muted">
                  Suggested questions
                </p>
                <div className="flex flex-wrap gap-2">
                  {getSuggestedPrompts(bot, uploadedDocs).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground-muted transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-card p-4">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder={`Ask about ${bot === 'irs' ? 'tax codes' : 'accounting standards'}… (Shift+Enter for new line)`}
                className="h-24 w-full resize-none rounded-2xl border border-border bg-surface-muted py-4 pl-4 pr-14 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  'absolute bottom-3 right-3 rounded-xl p-2.5 text-white shadow-lg transition-all',
                  accentBg,
                  (!input.trim() || isStreaming) && 'opacity-50',
                )}
              >
                <Send className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-foreground-subtle">
              <p>
                Output style: <strong className="text-foreground-muted">{outputStyle}</strong>
              </p>
              <p>AI can make mistakes. Verify citations.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResearchSession
