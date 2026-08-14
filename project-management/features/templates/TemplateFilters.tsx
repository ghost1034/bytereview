'use client'

/** Category chips and search for template gallery. */
import { Input } from '@/components/ui/input'
import type { TemplateCategory } from '../../lib/templates/types'
import { TEMPLATE_CATEGORIES } from '../../lib/templates/templateLibrary'

type Props = {
  category: TemplateCategory | 'all'
  search: string
  onCategoryChange: (c: TemplateCategory | 'all') => void
  onSearchChange: (q: string) => void
}

export function TemplateFilters({ category, search, onCategoryChange, onSearchChange }: Props) {
  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search templates…"
        className="rounded-md border border-input bg-background text-foreground max-w-md"
      />
      <div className="flex flex-wrap gap-2">
        {(['all', ...TEMPLATE_CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className="rounded-full border px-3 py-1 text-sm transition-colors"
            style={{
              borderColor: category === cat ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              background: category === cat ? 'hsl(var(--primary-soft))' : 'transparent',
              color: category === cat ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))',
            }}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>
    </div>
  )
}
