'use client'

/** Shared form field helpers for create/edit goal modal. */
import { type ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/** Label + children field wrapper. */
export function GoalFormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/** Checkbox list for multi-select goal relations. */
export function GoalMultiCheck({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: Array<{ id: string; label: string }>
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <GoalFormField label={label}>
      <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'var(--border-subtle)' }}>
        {items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </GoalFormField>
  )
}

/** Toggle id in a string list. */
export function toggleSelectedId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
