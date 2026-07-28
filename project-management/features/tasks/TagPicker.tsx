'use client'

/**
 * TagPicker — multi-select tag picker with create-on-the-fly.
 */
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { TasklyticPopoverContent } from '../ui/TasklyticPopoverContent'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { AVATAR_PALETTE } from '../../lib/colors'
import { newId } from '../../lib/ids'
import { useTagsStore } from '../../stores/entities'
import type { Tag } from '../../types'

type Props = {
  workspaceId: string
  selectedIds: string[]
  onAdd: (tagId: string) => void
  onRemove: (tagId: string) => void
}

export function TagPicker({ workspaceId, selectedIds, onAdd, onRemove }: Props) {
  const allTags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const addTag = useTagsStore((s) => s.add)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => selectedIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean) as Tag[],
    [allTags, selectedIds]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allTags.filter((t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
  }, [allTags, query, selectedIds])

  const createTag = async () => {
    const name = query.trim()
    if (!name) return
    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      onAdd(existing.id)
      setQuery('')
      return
    }
    const color = AVATAR_PALETTE[allTags.length % AVATAR_PALETTE.length]
    const id = newId()
    await addTag({ id, workspaceId, name, color })
    onAdd(id)
    setQuery('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-1 pr-1"
          style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}44` }}
        >
          {tag.name}
          <button type="button" aria-label={`Remove ${tag.name}`} onClick={() => onRemove(tag.id)}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
            style={{ color: 'var(--primary)', background: 'var(--bg-muted)' }}
          >
            <Plus className="h-3 w-3" /> Add tag
          </button>
        </PopoverTrigger>
        <TasklyticPopoverContent className="w-56 p-2" align="start">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create tag…"
            className="tl-input h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createTag()
            }}
          />
          <ul className="mt-2 max-h-36 overflow-y-auto">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="tl-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  onClick={() => {
                    onAdd(t.id)
                    setQuery('')
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
          {query.trim() && !filtered.some((t) => t.name.toLowerCase() === query.trim().toLowerCase()) ? (
            <button
              type="button"
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
              style={{ color: 'var(--primary)' }}
              onClick={() => void createTag()}
            >
              Create &quot;{query.trim()}&quot;
            </button>
          ) : null}
        </TasklyticPopoverContent>
      </Popover>
    </div>
  )
}
