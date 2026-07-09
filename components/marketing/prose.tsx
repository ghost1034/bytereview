import * as React from 'react'

import { cn } from '@/lib/utils'

interface ProseProps {
  children: React.ReactNode
  className?: string
  /** Constrain reading width for long-form content (default true). */
  narrow?: boolean
}

/**
 * Long-form prose wrapper. Uses @tailwindcss/typography but maps every prose-*
 * color to our semantic tokens so the prose looks correct in light + dark.
 */
export function Prose({ children, className, narrow = true }: ProseProps) {
  return (
    <div
      className={cn(
        'prose prose-base max-w-none',
        narrow && 'lg:prose-lg',
        // Color mappings — every prose-* color maps to a semantic token
        'prose-headings:text-foreground prose-headings:tracking-tight',
        'prose-h1:text-3xl prose-h1:font-semibold prose-h2:text-2xl prose-h2:font-semibold prose-h3:text-xl prose-h3:font-semibold',
        'prose-p:text-foreground-muted prose-p:leading-relaxed',
        'prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-em:text-foreground',
        'prose-li:text-foreground-muted prose-li:marker:text-foreground-subtle',
        'prose-blockquote:border-l-primary prose-blockquote:text-foreground-muted prose-blockquote:not-italic',
        'prose-inline-code:bg-surface-muted prose-inline-code:text-foreground prose-inline-code:rounded prose-inline-code:px-1.5 prose-inline-code:py-0.5 prose-inline-code:font-mono prose-inline-code:text-sm prose-inline-code:font-normal prose-inline-code:before:content-none prose-inline-code:after:content-none',
        'prose-pre:bg-surface-muted prose-pre:border prose-pre:border-border prose-pre:text-foreground prose-pre:rounded-lg prose-pre:font-mono',
        'prose-hr:border-border',
        'prose-th:text-foreground prose-td:text-foreground-muted',
        narrow ? 'mx-auto max-w-3xl' : '',
        className,
      )}
    >
      {children}
    </div>
  )
}
