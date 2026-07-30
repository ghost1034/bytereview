/** Goal query selectors — filters for list/tree views and reporting (step 26). */
import type { Goal, Team } from '../../types'
import { getFollowedGoalIds } from './goalMeta'
import { matchesTimeFilter } from './timeFrames'

export type GoalTab = 'mine' | 'followed' | 'team' | 'company' | 'all'

export type GoalFilters = {
  workspaceId: string
  tab?: GoalTab
  currentUserId?: string
  teams?: Team[]
  timeFilter?: 'all' | 'quarter' | 'year'
  year?: number
  ownerId?: string
  teamId?: string
  status?: Goal['status'] | 'all'
  search?: string
}

function teamMemberIds(teams: Team[], userId: string): Set<string> {
  const ids = new Set<string>()
  teams.forEach((t) => {
    if (t.memberIds.includes(userId)) t.memberIds.forEach((id) => ids.add(id))
  })
  return ids
}

/** Filter goals for the active tab and toolbar filters. */
export function filterGoals(all: Goal[], filters: GoalFilters): Goal[] {
  const {
    workspaceId,
    tab = 'all',
    currentUserId,
    teams = [],
    timeFilter = 'all',
    year,
    ownerId,
    status = 'all',
    search = '',
  } = filters

  let rows = all.filter((g) => g.workspaceId === workspaceId)

  if (tab === 'mine' && currentUserId) {
    rows = rows.filter((g) => g.ownerId === currentUserId)
  } else if (tab === 'followed' && currentUserId) {
    const ids = getFollowedGoalIds(currentUserId, rows.map((g) => g.id))
    rows = rows.filter((g) => ids.includes(g.id))
  } else if (tab === 'team' && currentUserId) {
    const members = teamMemberIds(teams, currentUserId)
    rows = rows.filter((g) => members.has(g.ownerId) && g.ownerId !== currentUserId)
  } else if (tab === 'company') {
    rows = rows.filter((g) => !g.parentGoalId && g.privacy === 'public')
  }

  if (ownerId && ownerId !== 'all') rows = rows.filter((g) => g.ownerId === ownerId)
  if (status !== 'all') rows = rows.filter((g) => g.status === status)
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    rows = rows.filter(
      (g) => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    )
  }
  rows = rows.filter((g) => matchesTimeFilter(g.timeFrame, timeFilter, year))
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** Reporting helper — step 26 chart system entry point. */
export function selectGoals(all: Goal[], filters: GoalFilters): Goal[] {
  return filterGoals(all, filters)
}

/** Map goal status to GoalStatus pill display (uses stored status). */
export function goalDisplayStatus(goal: Goal): Goal['status'] {
  return goal.status
}
