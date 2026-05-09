import * as React from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  icon?: React.ComponentType<{ className?: string }>
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
  icon: Icon = AlertTriangle,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive-soft px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className="flex size-12 items-center justify-center rounded-md bg-background ring-1 ring-destructive/30"
        aria-hidden
      >
        <Icon className="size-5 text-destructive" />
      </span>
      <div className="max-w-md space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-foreground-muted">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 pt-2">{action}</div>}
    </div>
  )
}
