import * as React from 'react'

import { cn } from '@/lib/utils'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add a blue glow + accent border treatment (use for featured/active cards). */
  glow?: boolean
}

/**
 * Glassmorphism surface for the dark homepage. Uses the shared `.glass-card`
 * utility (backdrop blur + inner top-light + layered shadow). Use sparingly —
 * backdrop-filter is GPU-costly when many are on screen at once.
 */
export function GlassCard({ className, glow, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        'glass-card rounded-2xl',
        glow && 'border-accent-blue-400/40 shadow-glow',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
