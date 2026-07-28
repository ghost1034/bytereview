'use client'

/** WorkspaceSwitcher — switch between workspaces the user belongs to. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WorkspaceIcon } from './WorkspaceIcon'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { useProjectsStore, useWorkspacesStore } from '../../stores/entities'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'

export function WorkspaceSwitcher({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const activeId = useUiStore((s) => s.activeWorkspaceId)
  const setActive = useUiStore((s) => s.setActiveWorkspaceId)
  const workspaces = useWorkspacesStore((s) =>
    s.list().filter((w) => !currentUserId || w.memberIds.includes(currentUserId))
  )
  const projectCounts = useProjectsStore((s) => {
    const counts: Record<string, number> = {}
    s.list().forEach((p) => {
      if (!p.archived && currentUserId && p.memberIds.includes(currentUserId)) {
        counts[p.workspaceId] = (counts[p.workspaceId] ?? 0) + 1
      }
    })
    return counts
  })
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0]

  const switchTo = (id: string) => {
    setActive(id)
    router.push(`/dashboard/project-management/w/${id}/home`)
  }

  if (!active) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={fullWidth ? 'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-paper-sm' : 'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-paper-sm'}
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
          >
            <WorkspaceIcon name={active.name} emoji={active.iconEmoji} />
            <span className={fullWidth ? 'min-w-0 flex-1 truncate' : 'max-w-[160px] truncate'}>{active.name}</span>
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="tl-popover-surface w-56">
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)} className="flex items-center gap-2">
              <WorkspaceIcon name={w.name} emoji={w.iconEmoji} />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
                style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}
              >
                {projectCounts[w.id] ?? 0}
              </span>
              {w.id === active.id && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
