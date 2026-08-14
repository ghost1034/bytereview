'use client'

import type { ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type Props = {
  collapsed: boolean
  onInvite: () => void
  onToggleCollapse?: () => void
  utilities?: ReactNode
}

export function SidebarFooter({ collapsed, onInvite, onToggleCollapse, utilities }: Props) {
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

      {utilities}

      {onToggleCollapse ? (
        <button
          type="button"
          className={cn(
            'flex h-9 items-center rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            collapsed ? 'w-9 justify-center' : 'w-full gap-2 px-2.5',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
          ) : (
            <PanelLeftClose className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
          )}
          {!collapsed ? <span style={{ color: 'hsl(var(--foreground-muted))' }}>Collapse navigator</span> : null}
        </button>
      ) : null}
    </div>
  )
}
