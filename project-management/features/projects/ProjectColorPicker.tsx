'use client'

import { PROJECT_COLORS, projectColorValue } from '../../lib/projectColors'

type Props = {
  value: string
  onChange: (color: string) => void
}

/** Brand palette swatches for project tiles. */
export function ProjectColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-105"
          style={{
            borderColor: value === c ? 'var(--primary)' : 'transparent',
            background: projectColorValue(c),
          }}
        />
      ))}
    </div>
  )
}
