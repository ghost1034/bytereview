/** Goal hierarchy helpers — tree building, cycle prevention, re-parenting. */
import type { Goal } from '../../types'

export type GoalTreeNode = {
  goal: Goal
  depth: number
  children: GoalTreeNode[]
}

/** Direct child goals by parentGoalId. */
export function getChildGoals(goals: Goal[], parentId: string): Goal[] {
  return goals.filter((g) => g.parentGoalId === parentId)
}

/** Root goals (no parent) within a filtered set. */
export function getRootGoals(goals: Goal[]): Goal[] {
  const ids = new Set(goals.map((g) => g.id))
  return goals.filter((g) => !g.parentGoalId || !ids.has(g.parentGoalId))
}

/** Build nested tree nodes from a flat goal list. */
export function buildGoalTree(goals: Goal[], parentId?: string, depth = 0): GoalTreeNode[] {
  const roots = parentId
    ? goals.filter((g) => g.parentGoalId === parentId)
    : getRootGoals(goals)
  return roots.map((goal) => ({
    goal,
    depth,
    children: buildGoalTree(goals, goal.id, depth + 1),
  }))
}

/** Flatten tree in depth-first order with depth labels. */
export function flattenGoalTree(nodes: GoalTreeNode[]): Array<{ goal: Goal; depth: number }> {
  const out: Array<{ goal: Goal; depth: number }> = []
  const walk = (list: GoalTreeNode[]) => {
    list.forEach((n) => {
      out.push({ goal: n.goal, depth: n.depth })
      walk(n.children)
    })
  }
  walk(nodes)
  return out
}

/** True if setting newParentId on goalId would create a cycle. */
export function wouldCreateGoalCycle(
  goals: Goal[],
  goalId: string,
  newParentId: string | undefined
): boolean {
  if (!newParentId || newParentId === goalId) return Boolean(newParentId === goalId)
  const byId = new Map(goals.map((g) => [g.id, g]))
  let cursor: string | undefined = newParentId
  while (cursor) {
    if (cursor === goalId) return true
    cursor = byId.get(cursor)?.parentGoalId
  }
  return false
}

/** Latest status update timestamp for a goal (passed in from caller). */
export function goalLastUpdateAt(
  goalId: string,
  statusUpdateTimes: Array<{ goalId: string; createdAt: string }>
): string | undefined {
  const rows = statusUpdateTimes.filter((r) => r.goalId === goalId)
  if (!rows.length) return undefined
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt
}
