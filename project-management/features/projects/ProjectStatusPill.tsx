'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ProjectStatus } from '../../types'
import { STATUS_LABELS } from './projectUtils'

const STATUS_STYLES: Record<Exclude<ProjectStatus, null>, { bg: string; color: string }> = {
  on_track: { bg: 'hsl(var(--success-soft))', color: 'hsl(var(--success))' },
  at_risk: { bg: 'hsl(var(--warning-soft))', color: 'hsl(var(--warning))' },
  off_track: { bg: 'hsl(var(--destructive-soft))', color: 'hsl(var(--destructive))' },
  on_hold: { bg: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' },
  complete: { bg: 'hsl(var(--info-soft))', color: 'hsl(var(--info))' },
}

type Props = {
  status: ProjectStatus
  editable?: boolean
  onChange?: (status: ProjectStatus) => void
}

export function ProjectStatusPill({ status, editable, onChange }: Props) {
  const label = status ? STATUS_LABELS[status] : 'Set status'
  const style = status ? STATUS_STYLES[status] : { bg: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }

  const pill = (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: style.bg, color: style.color }}
    >
      {label}
    </span>
  )

  if (!editable || !onChange) return pill

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(STATUS_LABELS) as Exclude<ProjectStatus, null>[]).map((key) => (
          <DropdownMenuItem key={key} onClick={() => onChange(key)}>
            {STATUS_LABELS[key]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => onChange(null)}>Clear status</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
