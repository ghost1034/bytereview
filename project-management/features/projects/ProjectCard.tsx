'use client'

/** ProjectCard — tile used on home and project grid. */
import Link from 'next/link'
import {
  Archive,
  MoreHorizontal,
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
import type { Project } from '../../types'
import { projectColorSoft } from '../../lib/projectColors'
import { archiveProject } from '../../lib/projectActions'
import { useTeamsStore, useTasksStore } from '../../stores/entities'
import { ProjectStatusPill } from './ProjectStatusPill'
import { projectDueLabel, projectProgress } from './projectUtils'

type Props = {
  project: Project
  href: string
  starred?: boolean
  currentUserId?: string
  onToggleStar?: () => void
  onArchive?: () => void
}

export function ProjectCard({ project, href, starred, currentUserId, onToggleStar, onArchive }: Props) {
  const team = useTeamsStore((s) => s.getById(project.teamId))
  const tasks = useTasksStore((s) => s.list())
  const pct = projectProgress(tasks, project.id)
  const due = projectDueLabel(project.dueOn)

  const handleArchive = (e: React.MouseEvent) => {
    e.preventDefault()
    if (currentUserId) void archiveProject(project.id, currentUserId).then(() => onArchive?.())
  }

  return (
    <div className="group relative w-full max-w-[280px]">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        {onToggleStar ? (
          <button
            type="button"
            aria-label={starred ? 'Unstar project' : 'Star project'}
            className={cn(
              'rounded p-1 transition',
              starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleStar()
            }}
          >
            <Star className="h-4 w-4" fill={starred ? 'hsl(var(--warning))' : 'none'} stroke="hsl(var(--warning))" />
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Project actions"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onToggleStar ? (
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); onToggleStar() }}>
                <Star className="mr-2 h-4 w-4" /> {starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={href}>Open</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleArchive}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Link
        href={href}
        className="tl-card block p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="mb-3 flex items-start">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
            style={{ background: projectColorSoft(project.color) }}
          >
            {project.iconEmoji ?? '📁'}
          </div>
        </div>
        <h3 className="font-medium">{project.name}</h3>
        <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {team?.name ?? 'Team'} · {project.memberIds.length} members
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'hsl(var(--surface-muted))' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'hsl(var(--success))' }} />
          </div>
          <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>{pct}%</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <ProjectStatusPill status={project.status} />
          {due && <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>Due {due}</span>}
        </div>
      </Link>
    </div>
  )
}
