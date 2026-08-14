'use client'

/** Single chat bubble — user or assistant with optional reasoning. */
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AiChatMessage } from '../../lib/ai/settingsStore'
import { AiProposalCard } from './AiProposalCard'

type Props = {
  message: AiChatMessage
  actorId: string | null
  onApplied?: (proposalId: string) => void
}

export function AiMessage({ message, actorId, onApplied }: Props) {
  const [showReasoning, setShowReasoning] = useState(false)
  const isUser = message.role === 'user'

  return (
    <div className={`px-3 py-2 ${isUser ? 'text-right' : ''}`}>
      <div
        className={`inline-block max-w-[95%] rounded-2xl px-3 py-2 text-sm ${
          isUser ? 'tl-btn-primary text-white' : 'tl-card shadow-sm'
        }`}
        style={isUser ? undefined : { color: 'hsl(var(--foreground-muted))' }}
      >
        <p className="whitespace-pre-wrap text-left">{message.content}</p>
      </div>

      {!isUser && message.reasoning ? (
        <button
          type="button"
          className="mt-1 flex items-center gap-0.5 text-xs"
          style={{ color: 'hsl(var(--foreground-subtle))' }}
          onClick={() => setShowReasoning((v) => !v)}
        >
          {showReasoning ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Show reasoning
        </button>
      ) : null}
      {!isUser && showReasoning && message.reasoning ? (
        <p className="mt-1 text-left text-xs italic" style={{ color: 'hsl(var(--foreground-subtle))' }}>
          {message.reasoning}
        </p>
      ) : null}

      {!isUser && message.proposals?.length ? (
        <div className="mt-2 space-y-2">
          {message.proposals.map((p) => (
            <AiProposalCard key={p.id} proposal={p} actorId={actorId} onApplied={() => onApplied?.(p.id)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
