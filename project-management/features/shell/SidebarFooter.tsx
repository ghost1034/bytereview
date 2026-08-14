'use client'

import { PanelLeftClose, PanelLeftOpen, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { User } from '../../types'

type Props = {
  collapsed: boolean
  currentUser?: User
  onInvite: () => void
  onToggleCollapse: () => void
}

export function SidebarFooter({ collapsed, currentUser, onInvite, onToggleCollapse }: Props) {
  const initials = currentUser?.name
    ? currentUser.name
        .split(/\s+/)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <div
      className={cn('flex flex-col gap-1 border-t p-2', collapsed && 'items-center')}
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={onInvite}
              aria-label="Invite people"
            >
              <UserPlus className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Invite people</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ color: 'hsl(var(--foreground-muted))' }}
          onClick={onInvite}
          aria-label="Invite people"
        >
          <UserPlus className="h-4 w-4" />
          Invite people
        </button>
      )}

      <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: currentUser?.avatarColor ?? 'hsl(var(--primary))' }}
          title={currentUser?.name}
          aria-hidden
        >
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{currentUser?.name ?? 'User'}</p>
            <p className="truncate text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {currentUser?.email}
            </p>
          </div>
        )}
        <button
          type="button"
          className="rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
          ) : (
            <PanelLeftClose className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
          )}
        </button>
      </div>
    </div>
  )
}
