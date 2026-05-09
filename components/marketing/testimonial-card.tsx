import * as React from 'react'
import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

interface TestimonialCardProps {
  quote: React.ReactNode
  author: string
  role?: React.ReactNode
  company?: React.ReactNode
  /** 1-5 star rating; rendered above the quote. */
  rating?: number
  className?: string
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TestimonialCard({
  quote,
  author,
  role,
  company,
  rating,
  className,
}: TestimonialCardProps) {
  const initials = getInitials(author)

  return (
    <figure
      className={cn(
        'flex h-full flex-col gap-5 rounded-xl border border-border bg-surface-raised p-6 shadow-xs',
        className,
      )}
    >
      {typeof rating === 'number' && (
        <div
          className="flex items-center gap-0.5 text-warning"
          aria-label={`${rating} out of 5 stars`}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                'size-4',
                i < rating ? 'fill-current' : 'fill-transparent text-foreground-subtle',
              )}
              aria-hidden
            />
          ))}
        </div>
      )}

      <blockquote className="text-base leading-relaxed text-foreground">
        &ldquo;{quote}&rdquo;
      </blockquote>

      <figcaption className="mt-auto flex items-center gap-3 border-t border-border pt-5">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground"
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {author}
          </p>
          {(role || company) && (
            <p className="truncate text-xs text-foreground-muted">
              {role}
              {role && company ? ' · ' : ''}
              {company}
            </p>
          )}
        </div>
      </figcaption>
    </figure>
  )
}
