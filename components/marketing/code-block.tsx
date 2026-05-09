'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  children: string
  language?: string
  /** Title rendered above the code (e.g. "POST /api/jobs"). */
  title?: React.ReactNode
  className?: string
  /** Show the copy-to-clipboard button (default true). */
  copyable?: boolean
}

export function CodeBlock({
  children,
  language,
  title,
  className,
  copyable = true,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* noop */
    }
  }, [children])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface-muted',
        className,
      )}
    >
      {(title || language || copyable) && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {title && (
              <span className="truncate text-xs font-medium text-foreground">
                {title}
              </span>
            )}
            {language && (
              <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
                {language}
              </span>
            )}
          </div>
          {copyable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopy}
              aria-label={copied ? 'Copied' : 'Copy code'}
              className="h-6 px-2 text-foreground-muted hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
            </Button>
          )}
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-foreground">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  )
}
