'use client'

/**
 * TaskRowActions — hover row menu (open, duplicate, convert, delete, move to section).
 */
import { Copy, Diamond, ExternalLink, FolderInput, GripVertical, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TasklyticDropdownMenuContent } from '../../ui/TasklyticDropdownMenuContent'
import { Button } from '@/components/ui/button'
import type { Section, Task } from '../../../types'
import { deleteTask, duplicateTask, setSectionForProject, setSubtype } from '../../../lib/taskActions'
import { useAuthStore } from '../../../stores/auth'

import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'

type Props = {
  task: Task
  projectId: string
  sections: Section[]
  onOpen: () => void
  dragListeners?: SyntheticListenerMap
  dragAttributes?: DraggableAttributes
}

/** Row action menu and drag handle shown on hover. */
export function TaskRowActions({ task, projectId, sections, onOpen, dragListeners, dragAttributes }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentSectionId = task.sectionIdByProject[projectId]

  const run = (fn: () => Promise<void>) => {
    if (!currentUserId) return
    void fn()
  }

  const moveToSection = (sectionId: string) => {
    if (!currentUserId || currentSectionId === sectionId) return
    void setSectionForProject(task.id, projectId, sectionId, currentUserId)
  }

  return (
    <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
      <button
        type="button"
        className="cursor-grab rounded p-1 hover:bg-[hsl(var(--surface-muted))] active:cursor-grabbing"
        aria-label="Drag task"
        {...dragAttributes}
        {...dragListeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <TasklyticDropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onOpen}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => duplicateTask(task.id, currentUserId!).then(() => undefined))}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
          </DropdownMenuItem>
          {sections.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> Move to section
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] max-h-64 overflow-y-auto">
                {sections.map((section) => (
                  <DropdownMenuItem
                    key={section.id}
                    disabled={currentSectionId === section.id}
                    onClick={() => moveToSection(section.id)}
                  >
                    {section.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => run(() => setSubtype(task.id, 'milestone', currentUserId!))}>
            <Diamond className="mr-2 h-3.5 w-3.5" /> Convert to milestone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => setSubtype(task.id, 'approval', currentUserId!))}>
            <ShieldCheck className="mr-2 h-3.5 w-3.5" /> Convert to approval
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => void deleteTask(task.id, currentUserId ?? undefined)}>
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </TasklyticDropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
