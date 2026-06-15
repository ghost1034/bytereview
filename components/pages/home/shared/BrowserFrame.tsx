import * as React from 'react'

import { cn } from '@/lib/utils'

interface BrowserFrameProps {
  /** Title shown next to the window dots. */
  label: React.ReactNode
  /** Optional content pinned to the right of the title bar (e.g. a status pill). */
  rightSlot?: React.ReactNode
  /** Frame body. */
  children: React.ReactNode
  className?: string
}

/**
 * Shared macOS-style window chrome for product mockups on the dark homepage.
 * Replaces the title bar that was hand-duplicated across the Form Fill, Inkwise,
 * Chrona, and Extraction mockups so every demo frame reads consistently.
 */
export function BrowserFrame({
  label,
  rightSlot,
  children,
  className,
}: BrowserFrameProps) {
  return (
    <div
      className={cn(
        'glass-card overflow-hidden rounded-2xl shadow-glow',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="size-3 rounded-full bg-foreground-subtle/40" aria-hidden />
          <span className="ml-2 text-xs text-foreground-subtle">{label}</span>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  )
}
