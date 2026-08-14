'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Archive,
  Copy,
  MoreHorizontal,
  Pencil,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Project } from '../../types'
import {
  archiveProject,
  duplicateProject,
  renameProject,
  toggleStarProject,
} from '../../lib/projectActions'
import { isRouteActive, projectDotColor } from './sidebarUtils'
import { TasklyticDialogContent } from './TasklyticDialogContent'

type Props = {
  project: Project
  href: string
  starred: boolean
  collapsed: boolean
  currentUserId: string | null
  starredIds: string[]
  onNavigate?: () => void
}

export function ProjectNavRow({
  project,
  href,
  starred,
  collapsed,
  currentUserId,
  starredIds,
  onNavigate,
}: Props) {
  const pathname = usePathname()
  const active = isRouteActive(pathname, href)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(project.name)

  const onStar = () => {
    if (!currentUserId) return
    void toggleStarProject(project.id, currentUserId, starredIds)
  }

  const onRename = async () => {
    if (!currentUserId) return
    await renameProject(project.id, renameValue, currentUserId)
    setRenameOpen(false)
  }

  const onDuplicate = () => {
    if (!currentUserId) return
    void duplicateProject(project.id, currentUserId)
  }

  const onArchive = () => {
    if (!currentUserId) return
    void archiveProject(project.id, currentUserId)
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            onClick={onNavigate}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={active ? { background: 'hsl(var(--primary-soft))' } : undefined}
            aria-current={active ? 'page' : undefined}
            aria-label={project.name}
          >
            <span>{project.iconEmoji ?? '📁'}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{project.name}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <>
      <div className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-[hsl(var(--surface-muted))]">
        <Link
          href={href}
          onClick={onNavigate}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
          style={
            active
              ? { background: 'hsl(var(--primary-soft))', color: 'hsl(var(--primary))' }
              : { color: 'hsl(var(--foreground-muted))' }
          }
          aria-current={active ? 'page' : undefined}
          aria-label={project.name}
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs"
            style={{ background: 'hsl(var(--surface-muted))' }}
          >
            {project.iconEmoji ?? (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: projectDotColor(project.color) }}
              />
            )}
          </span>
          <span className="truncate">{project.name}</span>
        </Link>
        <button
          type="button"
          className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={starred ? 'Unstar project' : 'Star project'}
          onClick={onStar}
        >
          <Star className="h-3.5 w-3.5" fill={starred ? 'hsl(var(--warning))' : 'none'} stroke="hsl(var(--warning))" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`${project.name} menu`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                setRenameValue(project.name)
                setRenameOpen(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onStar}>
              <Star className="mr-2 h-4 w-4" /> {starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <TasklyticDialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg">Rename project</DialogTitle>
          </DialogHeader>
          <Input
            className="tl-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void onRename()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button className="tl-btn-primary" onClick={() => void onRename()}>Save</Button>
          </DialogFooter>
        </TasklyticDialogContent>
      </Dialog>
    </>
  )
}
