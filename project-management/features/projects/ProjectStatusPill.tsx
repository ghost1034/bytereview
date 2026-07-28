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
  on_track: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
  at_risk: { bg: 'var(--warning-soft)', color: 'var(--warning)' },
  off_track: { bg: 'var(--danger-soft)', color: 'var(--danger)' },
  on_hold: { bg: 'var(--bg-muted)', color: 'var(--ink-muted)' },
  complete: { bg: 'var(--info-soft)', color: 'var(--info)' },
}

type Props = {
  status: ProjectStatus
  editable?: boolean
  onChange?: (status: ProjectStatus) => void
}

export function ProjectStatusPill({ status, editable, onChange }: Props) {
  const label = status ? STATUS_LABELS[status] : 'Set status'
  const style = status ? STATUS_STYLES[status] : { bg: 'var(--bg-muted)', color: 'var(--ink-muted)' }

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
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:shadow-focus">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="tl-popover-surface" align="start">
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
