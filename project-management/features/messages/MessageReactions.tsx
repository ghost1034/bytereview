'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { User } from '../../types'

const REACTION_EMOJIS = ['👍', '❤️', '🎉', '👀', '🙏'] as const

type Props = {
  reactions: Record<string, string[]>
  currentUserId: string | null
  userById: Map<string, User>
  onToggle: (emoji: string) => void
}

/** Emoji reaction chips shared by project messages and message comments. */
export function MessageReactions({ reactions, currentUserId, userById, onToggle }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {REACTION_EMOJIS.map((emoji) => {
          const users = reactions?.[emoji] ?? []
          const active = currentUserId ? users.includes(currentUserId) : false
          const names = users.map((id) => userById.get(id)?.name ?? 'Unknown').join(', ')
          return (
            <Tooltip key={emoji}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full px-2 py-0.5 text-xs transition-colors"
                  style={{
                    background: active ? 'hsl(var(--success-soft))' : 'hsl(var(--card))',
                    border: active ? '1px solid hsl(var(--success))' : '1px solid hsl(var(--border))',
                  }}
                  onClick={() => onToggle(emoji)}
                >
                  {emoji}
                  {users.length ? ` ${users.length}` : ''}
                </button>
              </TooltipTrigger>
              {users.length ? <TooltipContent>{names}</TooltipContent> : null}
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
