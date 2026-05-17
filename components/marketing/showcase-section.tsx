import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ShowcaseFeature {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
}

interface ShowcaseSectionProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  features?: ShowcaseFeature[]
  cta?: React.ReactNode
  /** Right-side media: image, video iframe, mock UI, etc. */
  media: React.ReactNode
  /** Reverse the column order so media sits on the left. */
  reverse?: boolean
  className?: string
  /** Page background. Defaults to a subtle alternating surface. */
  surface?: 'background' | 'surface' | 'surface-muted'
  /** Optional DOM id applied to the outer <section> for anchor links. */
  id?: string
}

export function ShowcaseSection({
  eyebrow,
  title,
  description,
  features,
  cta,
  media,
  reverse,
  className,
  surface = 'background',
  id,
}: ShowcaseSectionProps) {
  const surfaceClass =
    surface === 'surface'
      ? 'bg-surface'
      : surface === 'surface-muted'
        ? 'bg-surface-muted'
        : 'bg-background'

  return (
    <section id={id} className={cn('py-16 sm:py-20 lg:py-24', surfaceClass, className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'grid items-center gap-10 lg:grid-cols-2 lg:gap-16',
            reverse && 'lg:[&>*:first-child]:order-2',
          )}
        >
          <div className="space-y-5">
            {eyebrow && (
              <div className="text-xs font-medium uppercase tracking-wider text-primary">
                {eyebrow}
              </div>
            )}
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h2>
            {description && (
              <p className="max-w-xl text-balance text-base text-foreground-muted">
                {description}
              </p>
            )}

            {features && features.length > 0 && (
              <ul className="space-y-3 pt-2">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
                      aria-hidden
                    >
                      {feature.icon ? (
                        React.createElement(feature.icon, { className: 'size-3' })
                      ) : (
                        <Check className="size-3" />
                      )}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {feature.title}
                      </p>
                      {feature.description && (
                        <p className="text-sm text-foreground-muted">
                          {feature.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cta && <div className="pt-2">{cta}</div>}
          </div>

          <div className="relative">{media}</div>
        </div>
      </div>
    </section>
  )
}
