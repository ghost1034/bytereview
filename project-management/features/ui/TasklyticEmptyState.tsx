'use client'

/**
 * Shared editorial empty state — serif headline, sans subhead, inline SVG, CTA.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  illustration?: ReactNode
  headline: string
  subhead: string
  ctaLabel?: string
  onCta?: () => void
  ctaHref?: string
  learnMoreHref?: string
  learnMoreLabel?: string
  className?: string
}

function DefaultIllustration() {
  return (
    <svg width="120" height="88" viewBox="0 0 120 88" fill="none" aria-hidden="true" className="mx-auto mb-4">
      <rect x="8" y="12" width="104" height="64" rx="12" fill="hsl(var(--primary-soft))" stroke="hsl(var(--border))" />
      <rect x="20" y="28" width="48" height="6" rx="3" fill="hsl(var(--primary))" opacity="0.35" />
      <rect x="20" y="42" width="72" height="4" rx="2" fill="hsl(var(--foreground-subtle))" opacity="0.4" />
      <rect x="20" y="52" width="56" height="4" rx="2" fill="hsl(var(--foreground-subtle))" opacity="0.25" />
      <circle cx="92" cy="52" r="14" fill="hsl(var(--primary))" opacity="0.2" />
      <path d="M88 52l3 3 6-6" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Parameterized empty state for Tasklytic surfaces. */
export function TasklyticEmptyState({
  illustration,
  headline,
  subhead,
  ctaLabel,
  onCta,
  ctaHref,
  learnMoreHref,
  learnMoreLabel = 'Learn more',
  className = '',
}: Props) {
  const cta =
    ctaLabel && onCta ? (
      <Button className="tl-btn-primary mt-4 border-0" onClick={onCta}>
        {ctaLabel}
      </Button>
    ) : ctaLabel && ctaHref ? (
      <Button className="tl-btn-primary mt-4 border-0" asChild>
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    ) : null

  return (
    <div className={`tl-card flex flex-col items-center px-6 py-10 text-center shadow-sm ${className}`}>
      {illustration ?? <DefaultIllustration />}
      <h3 className="font-sans text-xl" style={{ color: 'hsl(var(--foreground))' }}>
        {headline}
      </h3>
      <p className="mt-2 max-w-sm text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {subhead}
      </p>
      {cta}
      {learnMoreHref ? (
        <Link href={learnMoreHref} className="mt-3 text-xs underline" style={{ color: 'hsl(var(--primary))' }}>
          {learnMoreLabel}
        </Link>
      ) : null}
    </div>
  )
}
