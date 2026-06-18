import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface PagerLink {
  href: string
  title: string
  sectionTitle: string
}

const cardClass =
  'group flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-all hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** Previous / next links between docs pages, in manifest order. */
export function DocsPager({ prev, next }: { prev: PagerLink | null; next: PagerLink | null }) {
  if (!prev && !next) return null

  return (
    <nav className="mt-12 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className={cardClass}>
          <span className="flex items-center gap-1 text-xs text-foreground-subtle">
            <ArrowLeft className="size-3.5" aria-hidden /> Previous
          </span>
          <span className="text-sm font-medium text-foreground">{prev.title}</span>
          <span className="text-xs text-foreground-muted">{prev.sectionTitle}</span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {next ? (
        <Link href={next.href} className={cn(cardClass, 'text-right sm:items-end')}>
          <span className="flex items-center gap-1 text-xs text-foreground-subtle">
            Next <ArrowRight className="size-3.5" aria-hidden />
          </span>
          <span className="text-sm font-medium text-foreground">{next.title}</span>
          <span className="text-xs text-foreground-muted">{next.sectionTitle}</span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  )
}
