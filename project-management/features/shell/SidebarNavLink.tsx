'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { NavItem } from './sidebarUtils'

type Props = {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}

export function SidebarNavLink({ item, active, collapsed, onNavigate }: Props) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-tour={item.tourId}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus',
        collapsed && 'justify-center px-2'
      )}
      style={
        active
          ? { background: 'var(--primary-soft)', color: 'var(--primary)' }
          : { color: 'var(--ink-secondary)' }
      }
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge ? (
        <span
          className="ml-auto rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent className="tl-popover-surface" side="right">
          {item.label}
          {item.badge ? ` (${item.badge})` : ''}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}
