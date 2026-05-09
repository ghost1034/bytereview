import * as React from 'react'

import { cn } from '@/lib/utils'

interface LogoTileProps {
  /** SVG logo component or img/Image element. */
  children: React.ReactNode
  /** Accessible label describing the brand. */
  label: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LogoTile({
  children,
  label,
  size = 'md',
  className,
}: LogoTileProps) {
  const sizeClass =
    size === 'sm' ? 'size-8' : size === 'lg' ? 'size-14' : 'size-12'
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-surface ring-1 ring-inset ring-border',
        sizeClass,
        className,
      )}
    >
      {children}
    </span>
  )
}
