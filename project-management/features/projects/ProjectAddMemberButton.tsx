'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { Project, User } from '../../types'
import { now } from '../../lib/time'
import { useProjectsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'

type Props = {
  project: Project
}

/** Add workspace members to a project. */
export function ProjectAddMemberButton({ project }: Props) {
  const updateProject = useProjectsStore((s) => s.update)
  const workspace = useWorkspacesStore((s) => s.getById(project.workspaceId))
  const users = useUsersStore((s) => s.list())
  const [open, setOpen] = useState(false)

  const candidates = users.filter(
    (u) => workspace?.memberIds.includes(u.id) && !project.memberIds.includes(u.id)
  )

  const addMember = async (user: User) => {
    await updateProject(project.id, {
      memberIds: [...project.memberIds, user.id],
      memberRoles: { ...project.memberRoles, [user.id]: 'Member' },
      modifiedAt: now(),
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">+ Add members</Button>
      </PopoverTrigger>
      <PopoverContent className="tl-popover-surface w-56 p-2" align="start">
        {candidates.length ? candidates.map((u) => (
          <button
            key={u.id}
            type="button"
            className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
            onClick={() => void addMember(u)}
          >
            {u.name}
          </button>
        )) : (
          <p className="px-2 py-1 text-xs" style={{ color: 'var(--ink-muted)' }}>All workspace members are already on this project.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
