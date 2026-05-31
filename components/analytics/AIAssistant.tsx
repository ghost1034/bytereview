'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Bot, Copy, Maximize2, MessageSquare, Minimize2, Send, Sparkles, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useStreamingChat } from '@/lib/analytics/useStreamingChat'
import { exportTranscript, type ChatTranscriptFormat } from '@/lib/analytics/exportChat'
import type { AnalyticsChatMessage, AnalyticsModuleId } from '@/lib/analytics/types'

const MODULE_NAMES: Record<AnalyticsModuleId, string> = {
  dashboard: 'Dashboard',
  clients: 'Client Management',
  variance: 'Variance & Flux Analysis',
  reconciliation: 'Intelligent Reconciliation',
  amortization: 'Fixed Assets',
  waterfall: 'AI Waterfall Schedule',
  'irs-bot': 'IRS Researcher',
  'gaap-bot': 'GAAP Researcher',
  assistant: 'AI Assistant',
  settings: 'Settings',
}

const SUGGESTED_PROMPTS: Record<AnalyticsModuleId, string[]> = {
  dashboard: [
    "Summarize my team's activity this week",
    'What items are pending my review?',
    'Show me the biggest variances across all active analyses',
  ],
  clients: [
    'How many active clients do we have?',
    'Summarize the recent activity for our top client',
    'What information is missing from the client profiles?',
    'Generate a summary of the client portfolio',
  ],
  variance: [
    'Explain the top 5 material variances',
    'Why did [Account Name] increase by X%?',
    "What's the appropriate materiality threshold for this dataset?",
    'Draft a variance analysis memo for the reviewer',
    'Are there any unusual patterns in these variances?',
    'What accounts should I investigate further?',
  ],
  reconciliation: [
    'Why are these transactions unmatched?',
    'Suggest matches for the remaining unmatched items',
    'Explain the difference between Source A and Source B totals',
    "What's causing the reconciling difference of $X?",
    'How should I categorize this exception?',
    "What's a good tolerance threshold for this reconciliation?",
  ],
  amortization: [
    'Is this the correct amortization method for this asset type?',
    'Explain the GAAP vs. Tax difference for this asset',
    'What are the ASC 842 requirements for this lease?',
    'Calculate the ROU asset for this lease with these terms',
    'What journal entries do I need for this month?',
    'What happens if I modify this lease mid-term?',
  ],
  waterfall: [
    'How much revenue will we recognize next month?',
    'Is this the correct recognition method under ASC 606?',
    'Explain the deferred revenue balance for this contract',
    'What if this contract is terminated early?',
    'Show me the remaining performance obligations',
    'How should I allocate revenue across these performance obligations?',
  ],
  'irs-bot': [
    'Open a new tax research session',
    'What was the last tax topic I researched?',
    'Summarize the memo I generated for the S-Corp compensation issue',
    'What IRC section covers home office deductions?',
  ],
  'gaap-bot': [
    'Open a new GAAP research session',
    'What was the last accounting topic I researched?',
    'Summarize the technical memo on the lease classification',
    'What ASC topic covers revenue from contracts?',
  ],
  assistant: [
    'What can you help me with?',
    'Explain how to use this platform',
  ],
  settings: [
    'How do I generate an invitation code for my firm?',
    'How do I export all firm data?',
  ],
}

function deriveModule(pathname: string | null): AnalyticsModuleId {
  if (!pathname) return 'dashboard'
  if (pathname.includes('/analytics/variance')) return 'variance'
  if (pathname.includes('/analytics/reconciliation')) return 'reconciliation'
  if (pathname.includes('/analytics/amortization')) return 'amortization'
  if (pathname.includes('/analytics/waterfall')) return 'waterfall'
  if (pathname.includes('/analytics/research/irs')) return 'irs-bot'
  if (pathname.includes('/analytics/research/gaap')) return 'gaap-bot'
  if (pathname.includes('/analytics/assistant')) return 'assistant'
  if (pathname.includes('/analytics/clients')) return 'clients'
  if (pathname.includes('/analytics/settings')) return 'settings'
  return 'dashboard'
}

export function AIAssistant() {
  const pathname = usePathname()
  const activeModule = useMemo(() => deriveModule(pathname), [pathname])

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [input, setInput] = useState('')
  const [moduleContext, setModuleContext] = useState<Record<string, unknown> | null>(null)
  // SSR-safe drag constraints for the launcher button — populated on mount.
  const [dragConstraints, setDragConstraints] = useState<
    { left: number; right: number; top: number; bottom: number } | undefined
  >(undefined)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Refs for values needed inside stable callbacks (avoid stale closures).
  const activeModuleRef = useRef(activeModule)
  const isOpenRef = useRef(isOpen)
  const isMinimizedRef = useRef(isMinimized)
  useEffect(() => {
    activeModuleRef.current = activeModule
  }, [activeModule])
  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])
  useEffect(() => {
    isMinimizedRef.current = isMinimized
  }, [isMinimized])

  const greeting: AnalyticsChatMessage = useMemo(
    () => ({
      role: 'model',
      content: `Hello! I'm your AI Accounting Assistant. I see you're in the ${MODULE_NAMES[activeModule]} module. How can I help you?`,
    }),
    [activeModule],
  )

  // Scan completed model turns for `[ACTION:ADD_RECON_PASS:<instruction>]` tags
  // and re-emit them as window events the reconciliation rules step listens
  // for. The visible transcript already has these tags stripped by the hook.
  const handleMessageComplete = useCallback((raw: string) => {
    if (activeModuleRef.current !== 'reconciliation') return
    const matches = Array.from(raw.matchAll(/\[ACTION:ADD_RECON_PASS:(.*?)\]/g))
    matches.forEach((m) => {
      const instruction = m[1].trim()
      if (!instruction) return
      window.dispatchEvent(
        new CustomEvent('ai-add-recon-pass', { detail: { instruction } }),
      )
    })
  }, [])

  const { messages, isStreaming, sendMessage, setMessages } = useStreamingChat({
    initialMessages: [greeting],
    onMessageComplete: handleMessageComplete,
  })

  // Reset conversation when module changes so the greeting reflects context.
  // Also bump the unread badge if the widget is hidden, so the user notices
  // the assistant has picked up the new module's data.
  useEffect(() => {
    setMessages([greeting])
    if (!isOpenRef.current || isMinimizedRef.current) {
      setUnreadCount((c) => c + 1)
    }
  }, [greeting, setMessages])

  // Modules can publish context via window events (matches CPAAnalytics' pattern).
  useEffect(() => {
    const handler = (e: Event) => {
      setModuleContext((e as CustomEvent).detail ?? null)
    }
    window.addEventListener('analytics-ai-context', handler)
    return () => window.removeEventListener('analytics-ai-context', handler)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (isOpen && !isMinimized) setUnreadCount(0)
  }, [isOpen, isMinimized])

  // Compute drag constraints client-side (window is unavailable during SSR).
  // Recomputed on resize so the bounds stay sensible if the viewport changes.
  useEffect(() => {
    const compute = () => {
      setDragConstraints({
        left: -window.innerWidth + 100,
        right: 0,
        top: -window.innerHeight + 100,
        bottom: 0,
      })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  const handleExport = (format: ChatTranscriptFormat) => {
    void exportTranscript(messages, format, {
      botLabel: 'ASSISTANT',
      filenamePrefix: 'AI_Assistant',
    })
  }

  const send = async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || isStreaming) return
    setInput('')
    if (!isOpen || isMinimized) setUnreadCount((c) => c + 1)
    await sendMessage(messageText, {
      kind: 'assistant',
      context: { activeModule: MODULE_NAMES[activeModule], moduleData: moduleContext },
    })
  }

  const handleCopy = (content: string) => {
    void navigator.clipboard.writeText(content)
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, height: isMinimized ? '60px' : '500px' }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              'pointer-events-auto mb-4 flex w-96 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300',
              isMinimized && 'w-64',
            )}
          >
            <div className="flex items-center justify-between bg-slate-900 p-4 text-white">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">AI Assistant</h3>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-surface-muted/30 p-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex max-w-[85%] gap-3',
                        msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                          msg.role === 'user'
                            ? 'bg-surface-muted text-foreground-muted'
                            : 'bg-blue-600 text-white',
                        )}
                      >
                        {msg.role === 'user' ? <MessageSquare size={14} /> : <Bot size={14} />}
                      </div>
                      <div
                        className={cn(
                          'group relative rounded-2xl p-3 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'rounded-tr-none bg-blue-600 text-white'
                            : 'rounded-tl-none border border-border bg-card text-foreground shadow-sm',
                        )}
                      >
                        {msg.role === 'model' ? (
                          <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-50">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          msg.content
                        )}

                        {msg.role === 'model' && msg.content && (
                          <div className="absolute -bottom-3 right-2 flex items-center gap-1 rounded-lg border border-border bg-card p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.content)}
                              className="rounded p-1 text-foreground-muted hover:text-blue-600"
                              title="Copy"
                            >
                              <Copy size={12} />
                            </button>
                            <div className="mx-0.5 h-3 w-px bg-border" />
                            <button
                              type="button"
                              onClick={() => handleExport('pdf')}
                              className="rounded p-1 text-[10px] font-bold text-foreground-muted hover:text-blue-600"
                              title="Export PDF"
                            >
                              PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExport('word')}
                              className="rounded p-1 text-[10px] font-bold text-foreground-muted hover:text-blue-600"
                              title="Export Word"
                            >
                              DOC
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExport('excel')}
                              className="rounded p-1 text-[10px] font-bold text-foreground-muted hover:text-green-600"
                              title="Export Excel"
                            >
                              XLS
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {messages.length === 1 && !isStreaming && (
                    <div className="mt-4 space-y-2">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground-muted">
                        Suggested Prompts
                      </p>
                      {SUGGESTED_PROMPTS[activeModule].map((prompt, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => send(prompt)}
                          className="block w-full rounded-xl border border-border bg-card p-2.5 text-left text-sm text-foreground-muted transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}

                  {isStreaming && messages[messages.length - 1]?.content === '' && (
                    <div className="mr-auto flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Bot size={14} />
                      </div>
                      <div className="rounded-2xl rounded-tl-none border border-border bg-card p-3 shadow-sm">
                        <div className="flex gap-1">
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle" />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.2s]" />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border bg-card p-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && send()}
                      placeholder="Ask anything about accounting..."
                      className="w-full rounded-xl border-none bg-surface-muted py-3 pl-4 pr-12 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => send()}
                      disabled={!input.trim() || isStreaming}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
                    Powered by Gemini
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        drag
        dragConstraints={dragConstraints}
        dragMomentum={false}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className={cn(
          'group pointer-events-auto relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-slate-900 text-white shadow-2xl transition-colors hover:bg-slate-800 active:cursor-grabbing',
          isOpen && 'hidden',
        )}
      >
        <Sparkles size={24} className="transition-transform group-hover:rotate-12" />
        {unreadCount > 0 ? (
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-blue-500 text-[10px] font-bold">
            {unreadCount}
          </div>
        ) : (
          <div className="absolute -right-1 -top-1 h-4 w-4 animate-pulse rounded-full border-2 border-card bg-blue-500" />
        )}
      </motion.button>
    </div>
  )
}

export default AIAssistant
