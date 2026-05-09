import * as React from 'react'

import { cn } from '@/lib/utils'

interface VideoCardProps {
  src: string
  title: string
  description?: React.ReactNode
  /** Aspect ratio override (default 16/9). */
  aspect?: 'video' | 'square' | '4/3'
  className?: string
}

const ASPECT_CLASS: Record<NonNullable<VideoCardProps['aspect']>, string> = {
  video: 'aspect-video',
  square: 'aspect-square',
  '4/3': 'aspect-[4/3]',
}

export function VideoCard({
  src,
  title,
  description,
  aspect = 'video',
  className,
}: VideoCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm',
        className,
      )}
    >
      {/* Browser-frame chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-muted px-3 py-2">
        <span className="size-2.5 rounded-full bg-foreground-subtle/40" aria-hidden />
        <span className="size-2.5 rounded-full bg-foreground-subtle/40" aria-hidden />
        <span className="size-2.5 rounded-full bg-foreground-subtle/40" aria-hidden />
        <span className="ml-2 truncate text-[11px] text-foreground-subtle">
          {title}
        </span>
      </div>
      <div className={cn('w-full bg-background', ASPECT_CLASS[aspect])}>
        <iframe
          src={src}
          title={title}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {description && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-sm text-foreground-muted">{description}</p>
        </div>
      )}
    </div>
  )
}
