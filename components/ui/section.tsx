import * as React from 'react'
import { cn } from '@/lib/utils'

interface SectionProps {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /** Render as a raised card surface */
  variant?: 'plain' | 'card'
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  variant = 'plain',
}: SectionProps) {
  const wrapperClass =
    variant === 'card'
      ? 'rounded-lg border border-border bg-surface-raised shadow-xs'
      : ''

  const hasHeader = !!(title || description || action)
  const headerPad = variant === 'card' ? 'px-5 pt-5' : ''
  const contentPad =
    variant === 'card' ? (hasHeader ? 'px-5 pb-5' : 'p-5') : ''

  return (
    <section className={cn(wrapperClass, className)}>
      {(title || description || action) && (
        <div
          className={cn(
            'flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4',
            title || description ? 'pb-4' : '',
            headerPad,
          )}
        >
          <div className="min-w-0 space-y-1">
            {title && (
              <h2 className="text-base font-semibold leading-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-foreground-muted">{description}</p>
            )}
          </div>
          {action && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </div>
      )}
      <div className={cn(contentPad, contentClassName)}>{children}</div>
    </section>
  )
}
