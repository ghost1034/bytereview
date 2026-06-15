import * as React from 'react'

import { cn } from '@/lib/utils'

interface MarketingHeroProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary + secondary CTA buttons; renders inline on desktop, stacked on mobile. */
  ctas?: React.ReactNode
  /** Stat row rendered below CTAs (e.g. "99% accuracy · 50ms latency"). */
  stats?: React.ReactNode
  /**
   * How the stats slot is wrapped. "grid" (default) lays children out as a 3-up card
   * grid; "plain" renders them as-is so the caller can supply a custom inline row.
   */
  statsLayout?: 'grid' | 'plain'
  /** Optional decorative content rendered to the right of the headline. */
  media?: React.ReactNode
  /**
   * Absolutely-positioned decorative layer rendered behind the content and the
   * built-in glows (e.g. a 3D canvas + static poster). Sits below the headline.
   */
  background?: React.ReactNode
  /** "gradient" = decorative dark-blue hero. "plain" = light surface hero. */
  backdrop?: 'gradient' | 'plain'
  /** Constrain to "narrow" (centered story) or "wide" (default for product pages). */
  width?: 'narrow' | 'wide'
  /** Extra classes merged onto the <h1> (e.g. a larger scale for a flagship hero). */
  titleClassName?: string
  className?: string
}

export function MarketingHero({
  eyebrow,
  title,
  description,
  ctas,
  stats,
  statsLayout = 'grid',
  media,
  background,
  backdrop = 'gradient',
  width = 'wide',
  titleClassName,
  className,
}: MarketingHeroProps) {
  const isGradient = backdrop === 'gradient'

  return (
    <section
      className={cn(
        'relative isolate overflow-hidden',
        isGradient
          ? 'bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to text-marketing-hero-foreground'
          : 'bg-surface text-foreground',
        className,
      )}
      aria-labelledby="hero-title"
    >
      {/* Custom decorative background layer (e.g. 3D canvas + poster) */}
      {background}

      {/* Built-in decorative glows (gradient backdrop only; skipped when a custom
          background layer is supplied so the two don't stack) */}
      {isGradient && !background && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-marketing-hero-accent/20 blur-3xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-40 right-1/4 h-[480px] w-[480px] rounded-full bg-marketing-hero-accent/10 blur-3xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--marketing-hero-border)/0.25)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--marketing-hero-border)/0.25)_1px,transparent_1px)] [background-size:48px_48px] opacity-30"
          />
        </>
      )}

      <div
        className={cn(
          'relative mx-auto px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28',
          width === 'narrow' ? 'max-w-3xl text-center' : 'max-w-7xl',
        )}
      >
        <div
          className={cn(
            'grid items-center gap-10',
            media ? 'lg:grid-cols-[1.1fr_1fr]' : 'grid-cols-1',
          )}
        >
          <div
            className={cn(
              'space-y-6',
              !media && width === 'wide' && 'max-w-3xl',
              width === 'narrow' && 'mx-auto',
            )}
          >
            {eyebrow && (
              <p
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider',
                  isGradient
                    ? 'border-marketing-hero-border bg-marketing-hero-accent/10 text-marketing-hero-foreground-muted'
                    : 'border-border bg-surface-muted text-foreground-muted',
                )}
              >
                {eyebrow}
              </p>
            )}
            <h1
              id="hero-title"
              className={cn(
                'text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl',
                isGradient ? 'text-marketing-hero-foreground' : 'text-foreground',
                titleClassName,
              )}
            >
              {title}
            </h1>
            {description && (
              <p
                className={cn(
                  'max-w-2xl text-balance text-base sm:text-lg',
                  isGradient
                    ? 'text-marketing-hero-foreground-muted'
                    : 'text-foreground-muted',
                  width === 'narrow' && 'mx-auto',
                )}
              >
                {description}
              </p>
            )}
            {ctas && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {ctas}
              </div>
            )}
            {stats && (
              <div className="pt-4">
                {statsLayout === 'grid' ? (
                  <div className="grid gap-4 sm:grid-cols-3">{stats}</div>
                ) : (
                  stats
                )}
              </div>
            )}
          </div>

          {media && <div className="lg:pl-6">{media}</div>}
        </div>
      </div>
    </section>
  )
}
