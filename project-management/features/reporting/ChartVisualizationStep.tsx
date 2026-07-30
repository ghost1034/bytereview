'use client'

/** Chart builder step 3 — visualization type and title. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ChartBuilderDraft } from '../../lib/reporting/types'
import type { ChartType } from '../../types'

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'number', label: 'Number' },
  { id: 'bar', label: 'Bar' },
  { id: 'column', label: 'Column' },
  { id: 'line', label: 'Line' },
  { id: 'donut', label: 'Donut' },
  { id: 'lollipop', label: 'Lollipop' },
  { id: 'burnup', label: 'Burnup' },
]

type Props = {
  draft: ChartBuilderDraft
  onChange: (patch: Partial<ChartBuilderDraft>) => void
}

/** Chart type, title, and top-N limit picker. */
export function ChartVisualizationStep({ draft, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chart-title">Title</Label>
        <Input id="chart-title" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Chart type</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CHART_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                draft.type === type.id ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : ''
              }`}
              style={{ borderColor: draft.type === type.id ? undefined : 'var(--border-subtle)' }}
              onClick={() => onChange({ type: type.id })}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>
      {draft.type !== 'number' && draft.type !== 'burnup' && draft.type !== 'line' ? (
        <div className="space-y-2">
          <Label>Top N</Label>
          <Select
            value={String(draft.topN ?? 0)}
            onValueChange={(v) => onChange({ topN: v === '0' ? undefined : Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">
              <SelectItem value="0">All</SelectItem>
              <SelectItem value="5">Top 5</SelectItem>
              <SelectItem value="10">Top 10</SelectItem>
              <SelectItem value="25">Top 25</SelectItem>
              <SelectItem value="50">Top 50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
