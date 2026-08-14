'use client'

/** Scrollable message list for the active AI thread. */
import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AiThread } from '../../lib/ai/settingsStore'
import { AiMessage } from './AiMessage'
import { AiTypingIndicator } from './AiTypingIndicator'

type Props = {
  thread: AiThread | undefined
  actorId: string | null
  typing: boolean
}

export function AiMessageList({ thread, actorId, typing }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages.length, typing])

  const empty = !thread?.messages.length

  return (
    <ScrollArea className="flex-1 px-1">
      <div className="py-2">
        {empty ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-subtle))' }}>
            Ask for summaries, status drafts, subtask suggestions, or workspace questions.
          </p>
        ) : (
          thread.messages.map((m) => <AiMessage key={m.id} message={m} actorId={actorId} />)
        )}
        {typing ? <AiTypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
