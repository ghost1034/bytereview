import * as React from 'react'

import { cn } from '@/lib/utils'

interface SectionEyebrowProps {
  children: React.ReactNode
  className?: string
  icon?: React.ComponentType<{ className?: string }>
}

/** Accent pill used above every section heading on the dark homepage. */
export function SectionEyebrow({ children, className, icon: Icon }: SectionEyebrowProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-accent-blue-400/30 bg-accent-blue-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-blue-300',
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}
