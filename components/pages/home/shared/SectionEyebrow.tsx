import * as React from 'react'

import { cn } from '@/lib/utils'
import { accent, type Accent } from './tones'

interface SectionEyebrowProps {
  children: React.ReactNode
  className?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Accent hue for the pill. Defaults to brand blue. */
  tone?: Accent
}

/** Accent pill used above every section heading on the dark homepage. */
export function SectionEyebrow({
  children,
  className,
  icon: Icon,
  tone,
}: SectionEyebrowProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider',
        accent(tone).pill,
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}
