'use client'

/** BoardColumnHeader — sticky paper-card header with WIP chip and section menu. */
import { useState } from 'react'
import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { Section } from '../../../types'
import { useSectionsStore } from '../../../stores/entities'
import { deleteProjectSection, renameProjectSection } from '../../../lib/projectActions'
import { isOverWip } from './boardUtils'

type Props = {
  section: Section
  taskCount: number
  onToggleCollapse: () => void
  onAddTask: () => void
  autoFocusName?: boolean
}

export function BoardColumnHeader({
  section,
  taskCount,
  onToggleCollapse,
  onAddTask,
  autoFocusName,
}: Props) {
  const updateSection = useSectionsStore((s) => s.update)
  const [editing, setEditing] = useState(autoFocusName ?? false)
  const [name, setName] = useState(section.name)
  const overWip = isOverWip(taskCount, section.wipLimit)
  const atLimit =
    section.wipLimit != null && section.wipLimit > 0 && taskCount >= section.wipLimit
  const wipLabel =
    section.wipLimit != null && section.wipLimit > 0
      ? `${taskCount}/${section.wipLimit}`
      : String(taskCount)

  const commitRename = async () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== section.name) await renameProjectSection(section.id, trimmed)
    else setName(section.name)
    setEditing(false)
  }

  const setWip = async () => {
    const raw = window.prompt('WIP limit (0 to clear)', String(section.wipLimit ?? ''))
    if (raw === null) return
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 0) return
    await updateSection(section.id, { wipLimit: n > 0 ? n : undefined })
  }

  return (
    <div className="tl-card mb-2 flex shrink-0 items-center gap-1 px-2 py-2 shadow-sm">
      <button type="button" aria-label="Collapse column" onClick={onToggleCollapse}>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--foreground-muted))' }} />
      </button>
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 flex-1 text-sm"
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitRename()
            if (e.key === 'Escape') {
              setName(section.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
          onDoubleClick={() => setEditing(true)}
        >
          {section.name}
        </button>
      )}
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          background:
            overWip || atLimit
              ? 'color-mix(in srgb, hsl(var(--destructive)) 15%, transparent)'
              : 'hsl(var(--surface-muted))',
          color: overWip || atLimit ? 'hsl(var(--destructive))' : 'hsl(var(--foreground-muted))',
        }}
        title={overWip ? 'WIP limit exceeded' : atLimit ? 'At WIP limit' : undefined}
        onDoubleClick={() => void setWip()}
      >
        {wipLabel}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onAddTask}>
        <Plus className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void setWip()}>Set WIP limit</DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleCollapse}>Collapse</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[hsl(var(--destructive))]"
            onClick={() => void deleteProjectSection(section.id)}
          >
            Delete section
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
