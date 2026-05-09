import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IconTile } from '@/components/ui/icon-tile'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'info'

interface FeatureCardProps {
  icon?: React.ComponentType<{ className?: string }>
  iconNode?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  bullets?: React.ReactNode[]
  cta?: { label: React.ReactNode; href: string }
  tone?: Tone
  /** Visually mute the card for "coming-soon" / placeholder states. */
  muted?: boolean
  className?: string
}

export function FeatureCard({
  icon,
  iconNode,
  title,
  description,
  bullets,
  cta,
  tone = 'neutral',
  muted,
  className,
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        'group flex h-full flex-col gap-4 rounded-xl border border-border bg-surface-raised p-6 shadow-xs transition-all',
        'hover:border-border-strong hover:shadow-sm',
        muted && 'opacity-70',
        className,
      )}
    >
      {(icon || iconNode) && (
        <IconTile tone={tone} size="lg">
          {iconNode ?? (icon ? React.createElement(icon, { className: 'size-5' }) : null)}
        </IconTile>
      )}

      <div className="space-y-2">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-foreground-muted">{description}</p>
        )}
      </div>

      {bullets && bullets.length > 0 && (
        <ul className="mt-1 space-y-1.5 text-sm text-foreground-muted">
          {bullets.map((bullet, idx) => (
            <li key={idx} className="flex gap-2">
              <span
                aria-hidden
                className="mt-2 inline-block size-1 shrink-0 rounded-full bg-foreground-subtle"
              />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {cta && (
        <div className="mt-auto pt-2">
          <Link
            href={cta.href}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            {cta.label}
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      )}
    </div>
  )
}
