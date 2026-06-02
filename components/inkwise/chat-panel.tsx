'use client'

import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUp,
  Bug,
  Copy,
  CornerDownLeft,
  Indent,
  Library,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Replace,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { InkwiseMarkdownView } from '@/components/inkwise/markdown-view'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { InkwiseBoundSource, InkwiseChatMessage, InkwiseChatThread, InkwiseDebugTimelineEntry } from '@/lib/api'
import {
  assistantMarkdownClassName,
  type ChatInsertMode,
  messageAttemptId,
  messageCitations,
  messageDisplayMarkdown,
  messageRetrievalRunId,
  type StreamState,
} from '@/lib/inkwise-chat'
import { cn } from '@/lib/utils'

const INKWISE_CHAT_SUGGESTED_PROMPTS = [
  'Summarize the key terms in my sources',
  'Draft an opening paragraph grounded in my references',
  'What do my sources say about the main risk factors?',
  'Suggest improvements to the selected draft text',
]

const MAX_COMPOSER_HEIGHT_PX = 160

export type ChatPanelProps = {
  // threads
  threads: InkwiseChatThread[]
  selectedThreadId: string | undefined
  onSelectThread: (id: string) => void
  onCreateThread: () => void
  onDeleteThread: (id: string) => void
  createThreadPending: boolean
  deleteThreadPending: boolean
  // messages
  messages: InkwiseChatMessage[]
  latestAssistantMessageId: string | undefined
  streamState: StreamState | null
  // composer
  chatInput: string
  onChatInputChange: (value: string) => void
  onSend: () => void
  sendPending: boolean
  // message actions
  onRetry: (messageId: string) => void
  retryPending: boolean
  onCopy: (message: InkwiseChatMessage) => void
  onInsert: (message: InkwiseChatMessage, mode: ChatInsertMode) => void
  chatInsertKey: string | null
  primaryChatInsertMode: ChatInsertMode
  primaryChatInsertLabel: string
  // debug (admin)
  chatDebugEnabled: boolean
  onOpenDebug: (target: { attemptId?: string | null; retrievalRunId?: string | null }) => void
  // draft selection
  activeDraftSelection: boolean
  draftSelectionLabel: string | undefined
  // sources
  boundSources: InkwiseBoundSource[]
  readyChatSources: InkwiseBoundSource[]
  filteredChatSources: InkwiseBoundSource[]
  selectedChatSourceIds: string[]
  chatSourceChecked: Record<string, boolean>
  onChatSourceCheckedChange: (next: Record<string, boolean>) => void
  chatSourceSearch: string
  onChatSourceSearchChange: (value: string) => void
}

export function ChatPanel(props: ChatPanelProps) {
  const { messages, streamState, chatInput, onChatInputChange, sendPending, selectedChatSourceIds } = props

  const viewportRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const streamText = streamState?.text
  const streamActive = Boolean(streamState)
  useEffect(() => {
    const el = viewportRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamText, streamActive])

  const canSend = !sendPending && Boolean(chatInput.trim()) && selectedChatSourceIds.length > 0

  const applySuggestedPrompt = (prompt: string) => {
    onChatInputChange(prompt)
    textareaRef.current?.focus()
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-muted/40">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <ChatThreadSwitcher {...props} />
        </div>

        <div ref={viewportRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} isLatestAssistant={message.id === props.latestAssistantMessageId} {...props} />
          ))}

          {streamState ? <StreamingBubble streamState={streamState} chatDebugEnabled={props.chatDebugEnabled} /> : null}

          {!messages.length && !streamState ? <ChatEmptyState onPromptSelect={applySuggestedPrompt} /> : null}
        </div>

        <div className="border-t border-border bg-card/60 p-3">
          <ChatComposer {...props} canSend={canSend} textareaRef={textareaRef} />
        </div>
      </div>
    </TooltipProvider>
  )
}

function ChatThreadSwitcher({
  threads,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  createThreadPending,
  deleteThreadPending,
}: ChatPanelProps) {
  return (
    <>
      <Select value={selectedThreadId ?? ''} onValueChange={onSelectThread}>
        <SelectTrigger className="h-9 min-w-0 flex-1 rounded-xl bg-card text-sm">
          <SelectValue placeholder="New chat" />
        </SelectTrigger>
        <SelectContent>
          {threads.map((thread) => (
            <SelectItem key={thread.id} value={thread.id}>
              {thread.title || 'New chat'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            onClick={onCreateThread}
            disabled={createThreadPending}
            aria-label="New thread"
          >
            {createThreadPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          New thread
        </TooltipContent>
      </Tooltip>
      {selectedThreadId ? (
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl text-foreground-muted hover:text-destructive"
                  disabled={deleteThreadPending}
                  aria-label="Delete thread"
                >
                  {deleteThreadPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Delete thread
            </TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
              <AlertDialogDescription>This removes the thread and all of its messages. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDeleteThread(selectedThreadId)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Sparkles className="h-3.5 w-3.5" />
    </div>
  )
}

function ChatMessageBubble({
  message,
  isLatestAssistant,
  onRetry,
  retryPending,
  sendPending,
  onCopy,
  onInsert,
  chatInsertKey,
  primaryChatInsertMode,
  primaryChatInsertLabel,
  chatDebugEnabled,
  onOpenDebug,
  activeDraftSelection,
}: ChatPanelProps & { message: InkwiseChatMessage; isLatestAssistant: boolean }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex w-full flex-row-reverse gap-2.5">
        <div className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-none bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  const attemptId = messageAttemptId(message)
  const retrievalRunId = messageRetrievalRunId(message)

  return (
    <div className="group flex w-full gap-2.5">
      <AssistantAvatar />
      <div className="relative min-w-0 max-w-[85%] rounded-2xl rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm">
        <InkwiseMarkdownView
          markdown={messageDisplayMarkdown(message)}
          citations={messageCitations(message)}
          renderInlineCitations
          className={assistantMarkdownClassName}
        />
        <div className="absolute -bottom-3 right-2 flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 opacity-100 shadow-sm transition-opacity focus-within:opacity-100 xl:opacity-0 xl:group-hover:opacity-100">
          <ActionIcon icon={Copy} label="Copy" onClick={() => onCopy(message)} />
          <ActionIcon
            icon={primaryChatInsertMode === 'append' ? CornerDownLeft : Indent}
            label={primaryChatInsertLabel}
            busy={chatInsertKey === `${message.id}:${primaryChatInsertMode}`}
            disabled={Boolean(chatInsertKey)}
            onClick={() => onInsert(message, primaryChatInsertMode)}
          />
          {activeDraftSelection ? (
            <ActionIcon
              icon={Replace}
              label="Replace selection"
              busy={chatInsertKey === `${message.id}:replace`}
              disabled={Boolean(chatInsertKey)}
              onClick={() => onInsert(message, 'replace')}
            />
          ) : null}
          {isLatestAssistant ? (
            <ActionIcon icon={RotateCcw} label="Retry" disabled={retryPending || sendPending} onClick={() => onRetry(message.id)} />
          ) : null}
          {chatDebugEnabled && (attemptId || retrievalRunId) ? (
            <ActionIcon icon={Bug} label="Debug" onClick={() => onOpenDebug({ attemptId, retrievalRunId })} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ActionIcon({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled || busy}
          aria-label={label}
          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function StreamingBubble({ streamState, chatDebugEnabled }: { streamState: StreamState; chatDebugEnabled: boolean }) {
  return (
    <div className="flex w-full gap-2.5">
      <AssistantAvatar />
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm">
        {streamState.text ? (
          <InkwiseMarkdownView
            markdown={streamState.contentWithCitations || streamState.text}
            citations={streamState.citations}
            renderInlineCitations
            className={assistantMarkdownClassName}
          />
        ) : (
          <div className="flex gap-1 py-1.5" aria-label="Assistant is thinking">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:0.4s]" />
          </div>
        )}
        {chatDebugEnabled && streamState.debugTimeline?.length ? <DebugTimeline entries={streamState.debugTimeline} /> : null}
      </div>
    </div>
  )
}

function DebugTimeline({ entries }: { entries: InkwiseDebugTimelineEntry[] }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-muted p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Backend debug</div>
      <div className="mt-2 space-y-2">
        {entries.map((entry) => (
          <div key={entry.stage} className="flex items-start justify-between gap-3 text-xs text-foreground-muted">
            <div>
              <div className="font-medium text-foreground">{entry.label}</div>
              <div>{entry.status}</div>
            </div>
            <div className="whitespace-nowrap">{typeof entry.duration_ms === 'number' ? `${entry.duration_ms} ms` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatEmptyState({ onPromptSelect }: { onPromptSelect: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">Ask about your draft or sources</div>
        <div className="mt-1 text-xs text-foreground-muted">Answers are grounded in your selected references.</div>
      </div>
      <div className="w-full space-y-2">
        {INKWISE_CHAT_SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPromptSelect(prompt)}
            className="block w-full rounded-xl border border-border bg-card p-2.5 text-left text-sm text-foreground-muted transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatComposer(props: ChatPanelProps & { canSend: boolean; textareaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const {
    chatInput,
    onChatInputChange,
    onSend,
    sendPending,
    canSend,
    textareaRef,
    activeDraftSelection,
    draftSelectionLabel,
    readyChatSources,
    selectedChatSourceIds,
  } = props
  // Auto-grow the textarea for typed input, suggested-prompt population, and
  // the post-send reset (sendChat.onSuccess clears chatInput).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`
  }, [chatInput, textareaRef])

  const warningHint = !readyChatSources.length
    ? 'Bind & prepare a source to chat'
    : !selectedChatSourceIds.length
      ? 'Select a source'
      : null

  return (
    <div className="space-y-2">
      {activeDraftSelection ? (
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">Selection attached{draftSelectionLabel ? `: ${draftSelectionLabel}` : ''}</span>
        </div>
      ) : null}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (canSend) onSend()
            }
          }}
          placeholder="Ask a grounded question..."
          rows={1}
          className="max-h-40 min-h-[44px] resize-none rounded-xl bg-card pr-12"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" onClick={onSend} disabled={!canSend} className="absolute bottom-2 right-2 h-8 w-8 rounded-lg" aria-label="Send">
              {sendPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Send grounded chat
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ChatSourcePopover {...props} />
        {warningHint ? <span className="text-xs text-amber-700">{warningHint}</span> : null}
      </div>
    </div>
  )
}

function ChatSourcePopover({
  boundSources,
  readyChatSources,
  filteredChatSources,
  selectedChatSourceIds,
  chatSourceChecked,
  onChatSourceCheckedChange,
  chatSourceSearch,
  onChatSourceSearchChange,
}: Pick<
  ChatPanelProps,
  | 'boundSources'
  | 'readyChatSources'
  | 'filteredChatSources'
  | 'selectedChatSourceIds'
  | 'chatSourceChecked'
  | 'onChatSourceCheckedChange'
  | 'chatSourceSearch'
  | 'onChatSourceSearchChange'
>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
          <Library className="h-3.5 w-3.5" />
          {readyChatSources.length ? `${selectedChatSourceIds.length} of ${readyChatSources.length} sources` : 'No ready sources'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-foreground">Chat references</div>
          {readyChatSources.length ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onChatSourceCheckedChange(Object.fromEntries(readyChatSources.map((item) => [item.source.id, true])))}
              >
                All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onChatSourceCheckedChange(Object.fromEntries(readyChatSources.map((item) => [item.source.id, false])))}
              >
                None
              </Button>
            </div>
          ) : null}
        </div>
        {boundSources.length ? (
          <Input
            value={chatSourceSearch}
            onChange={(event) => onChatSourceSearchChange(event.target.value)}
            placeholder="Search references"
            className="mt-2 h-8 bg-card text-sm"
          />
        ) : null}
        <div className="mt-2 grid max-h-56 gap-1.5 overflow-auto pr-1">
          {filteredChatSources.map((item) => (
            <label
              key={item.binding_id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm',
                item.grounded_chat_ready ? 'cursor-pointer text-foreground hover:bg-surface-muted' : 'text-foreground-subtle',
              )}
            >
              <Checkbox
                checked={chatSourceChecked[item.source.id] ?? item.grounded_chat_ready}
                disabled={!item.grounded_chat_ready}
                onCheckedChange={(checked) => onChatSourceCheckedChange({ ...chatSourceChecked, [item.source.id]: Boolean(checked) })}
              />
              <span className="truncate">{item.source.title}</span>
              {!item.grounded_chat_ready ? (
                <span className="ml-auto shrink-0 text-[10px]">{item.grounded_chat_reason || 'Not ready'}</span>
              ) : null}
            </label>
          ))}
          {boundSources.length && !filteredChatSources.length ? (
            <div className="px-1.5 py-2 text-xs text-foreground-muted">No bound references match that search.</div>
          ) : null}
          {!boundSources.length ? (
            <div className="px-1.5 py-2 text-xs text-foreground-muted">Bind references from the References tab to ground this chat.</div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
