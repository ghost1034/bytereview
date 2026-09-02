'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { MiniInboxDropdown } from '../inbox/MiniInboxDropdown'
import { RunningTimerChip } from '../psa/time/RunningTimerChip'

type Props = {
  onCreateTask: () => void
  onCreateProject: () => void
  onCreateForm: () => void
  onCreatePortfolio: () => void
  onCreateDashboard: () => void
}

/** Tasklytic controls rendered in CPAAutomation's shared top-bar action slot. */
export function TasklyticTopbarActions({
  onCreateTask,
  onCreateProject,
  onCreateForm,
  onCreatePortfolio,
  onCreateDashboard,
}: Props) {
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((state) => state.currentUserId)
  const inboxHref = workspaceId
    ? `/dashboard/project-management/w/${workspaceId}/inbox`
    : '#'

  return (
    <div className="tasklytic-root flex items-center gap-0.5 bg-transparent sm:gap-1" aria-label="Tasklytic actions">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1 px-2 lg:px-3"
            aria-label="Create in Tasklytic"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden lg:inline">Create</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onCreateTask}>Task</DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateProject}>Project</DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateForm}>Form</DropdownMenuItem>
          <DropdownMenuItem onClick={onCreatePortfolio}>Portfolio</DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateDashboard}>Dashboard</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RunningTimerChip />

      {currentUserId && workspaceId ? (
        <MiniInboxDropdown userId={currentUserId} inboxHref={inboxHref} />
      ) : null}
    </div>
  )
}
