import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  delta?: {
    value: React.ReactNode
    direction: 'up' | 'down' | 'flat'
    /** Whether an upward direction is positive (default true). For metrics like "errors", set to false. */
    positiveDirection?: 'up' | 'down'
    label?: React.ReactNode
  }
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  className,
}: StatCardProps) {
  let deltaToneClass = 'text-foreground-muted'
  let DeltaIcon = Minus
  if (delta && delta.direction !== 'flat') {
    DeltaIcon = delta.direction === 'up' ? ArrowUpRight : ArrowDownRight
    const positive =
      (delta.positiveDirection ?? 'up') === delta.direction
    deltaToneClass = positive ? 'text-success' : 'text-destructive'
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-border bg-surface-raised p-5 shadow-xs',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
          {label}
        </p>
        {Icon && (
          <span
            className="flex size-7 items-center justify-center rounded-md bg-surface-muted text-foreground-muted"
            aria-hidden
          >
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium tabular-nums',
              deltaToneClass,
            )}
          >
            <DeltaIcon className="size-3" aria-hidden />
            <span>{delta.value}</span>
          </span>
        )}
        {(delta?.label || hint) && (
          <span className="text-foreground-subtle">{delta?.label ?? hint}</span>
        )}
      </div>
    </div>
  )
}
