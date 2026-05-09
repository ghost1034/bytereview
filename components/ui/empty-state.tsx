import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 text-center',
        size === 'sm' ? 'py-8' : 'py-14',
        className,
      )}
    >
      {Icon && (
        <span
          className="flex size-12 items-center justify-center rounded-md bg-surface-muted ring-1 ring-border"
          aria-hidden
        >
          <Icon className="size-5 text-foreground-muted" />
        </span>
      )}
      <div className="max-w-md space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-foreground-muted">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
