import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const iconTileVariants = cva(
  'flex size-11 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-foreground-muted ring-border',
        brand: 'bg-primary-soft text-primary-soft-foreground ring-primary/10',
        success: 'bg-success-soft text-success ring-success/15',
        warning: 'bg-warning-soft text-warning ring-warning/20',
        info: 'bg-info-soft text-info ring-info/20',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

interface ActionCardProps
  extends VariantProps<typeof iconTileVariants> {
  icon: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  href?: string
  onClick?: () => void
  className?: string
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  onClick,
  tone,
  className,
}: ActionCardProps) {
  const content = (
    <>
      <span className={iconTileVariants({ tone })} aria-hidden>
        <Icon className="size-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-sm text-foreground-muted">
            {description}
          </span>
        )}
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-foreground-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-muted"
        aria-hidden
      />
    </>
  )

  const sharedClass = cn(
    'group flex items-center gap-4 rounded-lg border border-border bg-surface-raised p-4 text-left shadow-xs transition-all',
    'hover:border-border-strong hover:shadow-sm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={sharedClass}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={sharedClass}>
      {content}
    </button>
  )
}
