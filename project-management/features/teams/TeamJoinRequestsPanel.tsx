'use client'

/** Team join request banner for team admins. */
import { Button } from '@/components/ui/button'
import { approveTeamJoin, rejectTeamJoin } from '../../lib/teams/joinRequests'
import type { Team, Workspace } from '../../types'
import { useTeamJoinRequestsStore, useUsersStore } from '../../stores/entities'

type Props = {
  team: Team
  workspace: Workspace
  reviewerId: string
}

export function TeamJoinRequestsPanel({ team, workspace, reviewerId }: Props) {
  const requests = useTeamJoinRequestsStore((s) =>
    s.list().filter((r) => r.teamId === team.id && r.status === 'pending')
  )
  const users = useUsersStore((s) => s.list())

  if (requests.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--primary-soft)' }}>
      <p className="text-sm font-medium">Pending join requests</p>
      {requests.map((req) => {
        const user = users.find((u) => u.id === req.userId)
        return (
          <div key={req.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{user?.name ?? req.userId} wants to join</span>
            <div className="flex gap-2">
              <Button size="sm" className="tl-btn-primary" onClick={() => void approveTeamJoin(req.id, reviewerId, workspace)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => void rejectTeamJoin(req.id, reviewerId)}>
                Reject
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
