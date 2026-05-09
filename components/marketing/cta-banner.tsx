import * as React from 'react'

import { cn } from '@/lib/utils'

interface CTABannerProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  primary: React.ReactNode
  secondary?: React.ReactNode
  /** "gradient" = dark hero treatment. "soft" = primary-soft tinted. "plain" = neutral surface. */
  tone?: 'gradient' | 'soft' | 'plain'
  className?: string
}

export function CTABanner({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  tone = 'gradient',
  className,
}: CTABannerProps) {
  const surfaceClass =
    tone === 'gradient'
      ? 'bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to text-marketing-hero-foreground'
      : tone === 'soft'
        ? 'bg-primary-soft text-primary-soft-foreground'
        : 'bg-surface-muted text-foreground'

  const descClass =
    tone === 'gradient'
      ? 'text-marketing-hero-foreground-muted'
      : tone === 'soft'
        ? 'text-primary-soft-foreground/85'
        : 'text-foreground-muted'

  return (
    <section className={cn('py-16 sm:py-20', className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl px-6 py-12 text-center shadow-md sm:px-12 sm:py-16',
            surfaceClass,
          )}
        >
          {tone === 'gradient' && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-marketing-hero-accent/15 blur-3xl"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-40 right-0 h-[320px] w-[320px] rounded-full bg-marketing-hero-accent/10 blur-3xl"
              />
            </>
          )}

          <div className="relative mx-auto max-w-3xl space-y-5">
            {eyebrow && (
              <p
                className={cn(
                  'text-xs font-medium uppercase tracking-wider',
                  tone === 'gradient'
                    ? 'text-marketing-hero-foreground-muted'
                    : 'text-foreground-muted',
                )}
              >
                {eyebrow}
              </p>
            )}
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h2>
            {description && (
              <p className={cn('text-balance text-base sm:text-lg', descClass)}>
                {description}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {primary}
              {secondary}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
