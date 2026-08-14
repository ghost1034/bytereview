'use client'

/** Stacked member avatars — max 4 visible + "+N more". */
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { User } from '../../types'
import { colorForUser } from '../../lib/colors'

type Props = {
  users: User[]
  max?: number
  size?: 'sm' | 'md'
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function MemberAvatarStack({ users, max = 4, size = 'md' }: Props) {
  const visible = users.slice(0, max)
  const extra = users.length - visible.length
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'

  if (users.length === 0) {
    return <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>No members</span>
  }

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <Avatar key={user.id} className={`${dim} border-2`} style={{ borderColor: 'hsl(var(--card))' }}>
            <AvatarFallback style={{ background: colorForUser(user.id), color: '#fff' }}>
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {extra > 0 && (
        <span
          className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
        >
          +{extra} more
        </span>
      )}
    </div>
  )
}
