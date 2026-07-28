'use client'

/** Tasklytic user avatar with initials, color, and presence indicator. */
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { colorForUser, initialsFromName } from '../../lib/colors'
import { useUsersStore } from '../../stores/entities'
import { usePresence, type PresenceState } from '../../hooks/usePresence'

type Props = {
  userId: string
  size?: 'sm' | 'md' | 'lg'
  showPresence?: boolean
  className?: string
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
}

const DOT: Record<PresenceState, string> = {
  active: 'bg-[var(--accent)]',
  idle: 'bg-[var(--warning)]',
  offline: 'bg-[var(--ink-faint)]',
}

export function UserAvatar({ userId, size = 'md', showPresence = true, className }: Props) {
  const user = useUsersStore((s) => s.getById(userId))
  const presence = usePresence(userId)
  const bg = user?.avatarColor ?? colorForUser(userId)
  const initials = initialsFromName(user?.name ?? '?')

  return (
    <span className={cn('relative inline-flex', className)}>
      <Avatar className={SIZE[size]}>
        <AvatarFallback className="font-medium text-white" style={{ backgroundColor: bg }}>
          {initials}
        </AvatarFallback>
      </Avatar>
      {showPresence ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-elevated)]',
            DOT[presence]
          )}
          aria-label={`Presence: ${presence}`}
        />
      ) : null}
    </span>
  )
}
