import * as React from 'react'

import { IconTile } from '@/components/ui/icon-tile'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: React.ReactNode
  value: React.ReactNode
  sublabel?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'info'
  size?: 'sm' | 'md' | 'lg'
  /** Render on a dark surface (e.g. inside a hero); inverts text colors. */
  inverted?: boolean
  className?: string
}

export function MetricCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'brand',
  size = 'md',
  inverted,
  className,
}: MetricCardProps) {
  const valueSize =
    size === 'sm'
      ? 'text-2xl'
      : size === 'lg'
        ? 'text-5xl'
        : 'text-3xl sm:text-4xl'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-5 shadow-xs',
        inverted
          ? 'border-marketing-hero-border bg-marketing-hero-from/30 backdrop-blur-sm'
          : 'border-border bg-surface-raised',
        className,
      )}
    >
      {icon && (
        <IconTile icon={icon} tone={tone} size={size === 'lg' ? 'lg' : 'md'} />
      )}
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-wider',
          inverted ? 'text-marketing-hero-foreground-muted' : 'text-foreground-subtle',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'font-semibold tabular-nums tracking-tight',
          valueSize,
          inverted ? 'text-marketing-hero-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sublabel && (
        <p
          className={cn(
            'text-xs',
            inverted ? 'text-marketing-hero-foreground-muted' : 'text-foreground-muted',
          )}
        >
          {sublabel}
        </p>
      )}
    </div>
  )
}
