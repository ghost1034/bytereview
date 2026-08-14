'use client'

import type { ProjectStatus } from '../../types'
import { STATUS_LABELS } from '../projects/projectUtils'

const STATUS_KEYS: Exclude<ProjectStatus, null>[] = [
  'on_track',
  'at_risk',
  'off_track',
  'on_hold',
  'complete',
]

const STATUS_STYLES: Record<Exclude<ProjectStatus, null>, { bg: string; color: string }> = {
  on_track: { bg: 'hsl(var(--success-soft))', color: 'hsl(var(--success))' },
  at_risk: { bg: 'hsl(var(--warning-soft))', color: 'hsl(var(--warning))' },
  off_track: { bg: 'hsl(var(--destructive-soft))', color: 'hsl(var(--destructive))' },
  on_hold: { bg: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' },
  complete: { bg: 'hsl(var(--info-soft))', color: 'hsl(var(--info))' },
}

type Props = {
  value: Exclude<ProjectStatus, null>
  onChange: (status: Exclude<ProjectStatus, null>) => void
}

/** Segmented status pill picker for the status update composer. */
export function StatusSegmentPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {STATUS_KEYS.map((key) => {
        const active = value === key
        const style = STATUS_STYLES[key]
        return (
          <button
            key={key}
            type="button"
            className="rounded-full px-2.5 py-1 text-xs font-medium transition-opacity"
            style={{
              background: style.bg,
              color: style.color,
              opacity: active ? 1 : 0.55,
              outline: active ? '2px solid hsl(var(--primary))' : 'none',
            }}
            onClick={() => onChange(key)}
          >
            {STATUS_LABELS[key]}
          </button>
        )
      })}
    </div>
  )
}
