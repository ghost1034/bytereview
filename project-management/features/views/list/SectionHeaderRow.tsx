'use client'

/**
 * SectionHeaderRow — collapsible group/section header with count and actions.
 */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TasklyticDropdownMenuContent } from '../../ui/TasklyticDropdownMenuContent'
import type { Section } from '../../../types'
import {
  deleteProjectSection,
  renameProjectSection,
  reorderProjectSections,
} from '../../../lib/projectActions'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LIST_COMPLETE_COLUMN_WIDTH, LIST_ROW_HEIGHT } from './listTypes'

type Props = {
  label: string
  groupKey: string
  section?: Section
  taskCount: number
  taskIds: string[]
  collapsed: boolean
  isSectionGroup: boolean
  projectId: string
  sectionIds: string[]
  selected: Set<string>
  onToggleCollapse: () => void
  onToggleSelect: () => void
  onAddTask: () => void
  autoFocusName?: boolean
  onSectionNamed?: () => void
}

/** Sticky section or group header row. */
export function SectionHeaderRow({
  label,
  groupKey,
  section,
  taskCount,
  taskIds,
  collapsed,
  isSectionGroup,
  projectId,
  sectionIds,
  selected,
  onToggleCollapse,
  onToggleSelect,
  onAddTask,
  autoFocusName,
  onSectionNamed,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label)
  const allSelected = taskIds.length > 0 && taskIds.every((id) => selected.has(id))
  const someSelected = taskIds.some((id) => selected.has(id))
  const checkState = allSelected ? true : someSelected ? 'indeterminate' : false

  useEffect(() => {
    if (autoFocusName && section) {
      setName(section.name)
      setEditing(true)
    }
  }, [autoFocusName, section])

  const sortable = useSortable({
    id: isSectionGroup && section ? `section:${section.id}` : `group:${groupKey}`,
    data: { type: 'section', sectionId: section?.id, groupKey },
    disabled: !isSectionGroup || !section,
  })

  const moveSection = async (to: 'up' | 'down' | 'top' | 'bottom') => {
    if (!section) return
    const ids = [...sectionIds]
    const idx = ids.indexOf(section.id)
    if (idx === -1) return
    ids.splice(idx, 1)
    if (to === 'up' && idx > 0) ids.splice(idx - 1, 0, section.id)
    else if (to === 'down' && idx < sectionIds.length - 1) ids.splice(idx + 1, 0, section.id)
    else if (to === 'top') ids.unshift(section.id)
    else ids.push(section.id)
    await reorderProjectSections(projectId, ids)
  }

  const saveName = async () => {
    if (!section) return
    await renameProjectSection(section.id, name)
    setEditing(false)
    onSectionNamed?.()
  }

  return (
    <div
      ref={sortable.setNodeRef}
      className="sticky z-20 flex items-center gap-2 border-b px-2"
      style={{
        top: LIST_ROW_HEIGHT,
        height: LIST_ROW_HEIGHT,
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--card))',
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      {isSectionGroup && section ? (
        <button type="button" className="cursor-grab p-1" {...sortable.attributes} {...sortable.listeners}>
          <GripVertical className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-subtle))' }} />
        </button>
      ) : (
        <span className="w-6" />
      )}
      <Checkbox
        className="tl-checkbox"
        checked={checkState}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        aria-label={`Select all in ${label}`}
      />
      <span style={{ width: LIST_COMPLETE_COLUMN_WIDTH, flexShrink: 0 }} aria-hidden />
      <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? (
          <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
        )}
      </button>
      {editing && section ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 max-w-xs font-sans text-sm"
          autoFocus
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveName()
            if (e.key === 'Escape') {
              setName(label)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="font-sans text-sm font-medium"
          style={{ color: 'hsl(var(--foreground))' }}
          onDoubleClick={() => section && setEditing(true)}
        >
          {label}
        </button>
      )}
      <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {taskCount}
      </span>
      <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={onAddTask}>
        <Plus className="h-4 w-4" />
      </Button>
      {isSectionGroup && section ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <TasklyticDropdownMenuContent align="end">
            {taskCount === 0 ? (
              <DropdownMenuItem className="text-destructive" onClick={() => void deleteProjectSection(section.id)}>
                Delete empty section
              </DropdownMenuItem>
            ) : null}
            {taskCount === 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => setEditing(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void deleteProjectSection(section.id)}>
              Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void moveSection('up')}>Move up</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void moveSection('down')}>Move down</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void moveSection('top')}>Move to top</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void moveSection('bottom')}>Move to bottom</DropdownMenuItem>
          </TasklyticDropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
