'use client'

import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ActionIcon({
  icon: Icon,
  label,
  onClick,
  onMouseDown,
  disabled,
  busy,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  onMouseDown?: (event: React.MouseEvent) => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          onMouseDown={onMouseDown}
          disabled={disabled || busy}
          aria-label={label}
          className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
