import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const iconTileVariants = cva(
  'flex shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-foreground-muted ring-border',
        brand: 'bg-primary-soft text-primary-soft-foreground ring-primary/10',
        success: 'bg-success-soft text-success ring-success/15',
        warning: 'bg-warning-soft text-warning ring-warning/20',
        info: 'bg-info-soft text-info ring-info/20',
      },
      size: {
        sm: 'size-8',
        md: 'size-10',
        lg: 'size-12',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
)

interface IconTileProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconTileVariants> {
  /** Optional lucide-style icon component. Children take precedence (used for SVG logos). */
  icon?: React.ComponentType<{ className?: string }>
  children?: React.ReactNode
}

export function IconTile({
  icon: Icon,
  tone,
  size,
  className,
  children,
  ...rest
}: IconTileProps) {
  const iconSize = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'
  return (
    <span
      aria-hidden
      className={cn(iconTileVariants({ tone, size }), className)}
      {...rest}
    >
      {children ?? (Icon ? <Icon className={iconSize} /> : null)}
    </span>
  )
}
