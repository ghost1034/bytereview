'use client'

/**
 * ReactionRow — emoji reactions with toggle, counts, and reactor tooltip.
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Comment, User } from '../../../types'

const REACTION_EMOJIS = ['👍', '❤️', '🎉', '👀', '🙏'] as const

type Props = {
  comment: Comment
  currentUserId: string | null
  userById: Map<string, User>
  onToggle: (emoji: string) => void
}

/** Emoji reaction chips for a comment. */
export function ReactionRow({ comment, currentUserId, userById, onToggle }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {REACTION_EMOJIS.map((emoji) => {
          const users = comment.reactions?.[emoji] ?? []
          const active = currentUserId ? users.includes(currentUserId) : false
          const names = users.map((id) => userById.get(id)?.name ?? 'Unknown').join(', ')

          return (
            <Tooltip key={emoji}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full px-2 py-0.5 text-xs transition-colors"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                  }}
                  onClick={() => onToggle(emoji)}
                >
                  {emoji}
                  {users.length ? ` ${users.length}` : ''}
                </button>
              </TooltipTrigger>
              {users.length ? (
                <TooltipContent className="tl-popover-surface">{names || 'Reactions'}</TooltipContent>
              ) : null}
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
