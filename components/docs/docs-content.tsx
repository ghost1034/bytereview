import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'

import { cn } from '@/lib/utils'

interface DocsContentProps {
  markdown: string
  className?: string
}

/**
 * Renders a docs markdown body with the shared `react-markdown` pipeline and
 * `@tailwindcss/typography` prose styling tuned to the design tokens.
 *
 * `rehype-slug` stamps stable `id`s onto every heading (using github-slugger);
 * the TOC's `extractHeadings` uses the same slugger, so anchors and TOC links
 * always agree. Plugin order matters: `rehype-sanitize` runs first, then
 * `rehype-slug` adds ids afterward so they aren't stripped/clobber-prefixed.
 */
export function DocsContent({ markdown, className }: DocsContentProps) {
  return (
    <div
      className={cn(
        'prose prose-slate max-w-none dark:prose-invert',
        'prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-a:font-medium prose-a:text-primary hover:prose-a:text-primary',
        'prose-blockquote:border-l-primary prose-blockquote:bg-surface-muted prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-foreground-muted',
        'prose-inline-code:rounded prose-inline-code:bg-surface-muted prose-inline-code:px-1 prose-inline-code:py-0.5 prose-inline-code:font-mono prose-inline-code:text-[0.85em] prose-inline-code:before:content-none prose-inline-code:after:content-none',
        'prose-pre:font-mono',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize, rehypeSlug]}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const external = typeof href === 'string' && /^https?:\/\//.test(href)
            return (
              <a
                href={href}
                {...props}
                {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
              >
                {children as ReactNode}
              </a>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
