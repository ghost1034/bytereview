import * as React from 'react'
import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PricingTierProps {
  name: React.ReactNode
  price: React.ReactNode
  period?: React.ReactNode
  description?: React.ReactNode
  features: React.ReactNode[]
  cta: React.ReactNode
  /** Mark this as the highlighted/recommended tier. */
  highlighted?: boolean
  /** Pill rendered above the name (e.g. "Most popular"). */
  badge?: React.ReactNode
  /** Optional fine-print rendered below the price (e.g. "Includes 100 pages"). */
  fineprint?: React.ReactNode
  className?: string
}

export function PricingTier({
  name,
  price,
  period = '/month',
  description,
  features,
  cta,
  highlighted,
  badge,
  fineprint,
  className,
}: PricingTierProps) {
  return (
    <div
      className={cn(
        'relative flex h-full flex-col gap-6 rounded-xl border bg-surface-raised p-6 shadow-xs sm:p-7',
        highlighted
          ? 'border-primary ring-2 ring-primary/15'
          : 'border-border',
        className,
      )}
    >
      {(badge || highlighted) && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="default" className="rounded-full px-3 py-0.5 text-xs">
            {badge ?? 'Most popular'}
          </Badge>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">{name}</h3>
        {description && (
          <p className="text-sm text-foreground-muted">{description}</p>
        )}
      </div>

      <div className="space-y-1">
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
            {price}
          </span>
          {period && (
            <span className="text-sm text-foreground-muted">{period}</span>
          )}
        </p>
        {fineprint && (
          <p className="text-xs text-foreground-subtle">{fineprint}</p>
        )}
      </div>

      <ul className="space-y-2.5 text-sm">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-foreground-muted">
            <Check
              className="mt-0.5 size-4 shrink-0 text-success"
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">{cta}</div>
    </div>
  )
}
