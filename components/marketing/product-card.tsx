import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { IconTile } from '@/components/ui/icon-tile'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  icon: React.ComponentType<{ className?: string }>
  name: React.ReactNode
  description?: React.ReactNode
  href: string
  /** Status pill shown on the right (e.g. "Soon", "Beta"). */
  status?: 'live' | 'beta' | 'soon' | 'free'
  size?: 'sm' | 'md'
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'info'
  className?: string
}

const STATUS_LABEL: Record<NonNullable<ProductCardProps['status']>, string> = {
  live: 'Live',
  beta: 'Beta',
  soon: 'Soon',
  free: 'Free',
}

export function ProductCard({
  icon,
  name,
  description,
  href,
  status,
  size = 'md',
  tone = 'brand',
  className,
}: ProductCardProps) {
  const isCompact = size === 'sm'

  return (
    <Link
      href={href}
      className={cn(
        'group flex items-start gap-3 rounded-lg border border-border bg-surface-raised text-left shadow-xs transition-all',
        'hover:border-border-strong hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isCompact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <IconTile icon={icon} tone={tone} size={isCompact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate font-semibold text-foreground',
              isCompact ? 'text-sm' : 'text-sm',
            )}
          >
            {name}
          </span>
          {status && status !== 'live' && (
            <Badge
              variant="secondary"
              className={cn(
                'h-4 px-1.5 text-[10px] font-medium tabular-nums',
                status === 'free' &&
                  'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
            >
              {STATUS_LABEL[status]}
            </Badge>
          )}
        </div>
        {description && (
          <p
            className={cn(
              'text-foreground-muted',
              isCompact ? 'text-xs' : 'text-xs',
            )}
          >
            {description}
          </p>
        )}
      </div>
      {!isCompact && (
        <ArrowRight
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-muted"
          aria-hidden
        />
      )}
    </Link>
  )
}
