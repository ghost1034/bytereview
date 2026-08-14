'use client'

/**
 * TaskFollowersField — collaborator avatar stack with add/remove and follow toggle.
 */
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { addFollower, removeFollower } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { UserAvatar } from '../profile/UserAvatar'
import type { Task } from '../../types'

type Props = { task: Task }

export function TaskFollowersField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(task.workspaceId))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const memberIds = useMemo(
    () => new Set(workspace?.memberIds ?? users.map((u) => u.id)),
    [users, workspace?.memberIds]
  )
  const followers = task.collaboratorIds.map((id) => users.find((u) => u.id === id)).filter(Boolean)
  const isFollowing = currentUserId ? task.collaboratorIds.includes(currentUserId) : false

  const candidates = users.filter(
    (u) =>
      memberIds.has(u.id) &&
      !task.collaboratorIds.includes(u.id) &&
      (!query.trim() || u.name.toLowerCase().includes(query.trim().toLowerCase()))
  )

  const toggleFollow = async () => {
    if (!currentUserId) return
    if (isFollowing) await removeFollower(task.id, currentUserId, currentUserId)
    else await addFollower(task.id, currentUserId, currentUserId)
  }

  return (
    <div className="text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span style={{ color: 'hsl(var(--foreground-muted))' }}>Followers</span>
        {currentUserId ? (
          <button type="button" className="text-xs" style={{ color: 'hsl(var(--primary))' }} onClick={() => void toggleFollow()}>
            {isFollowing ? 'Unfollow' : 'Follow task'}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {followers.map((u) =>
          u ? (
            <span key={u.id} className="group relative inline-flex">
              <UserAvatar userId={u.id} size="sm" showPresence={false} />
              <button
                type="button"
                className="absolute -right-1 -top-1 hidden rounded-full bg-[hsl(var(--card))] p-0.5 group-hover:block"
                aria-label={`Remove ${u.name}`}
                onClick={() => currentUserId && void removeFollower(task.id, u.id, currentUserId)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ) : null
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}
              aria-label="Add follower"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="tl-input h-8 text-sm"
              autoFocus
            />
            <ul className="mt-2 max-h-36 overflow-y-auto">
              {candidates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[hsl(var(--surface-muted))]"
                    onClick={() => {
                      if (currentUserId) void addFollower(task.id, u.id, currentUserId)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <UserAvatar userId={u.id} size="sm" showPresence={false} />
                    {u.name}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
