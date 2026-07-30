/**
 * Goal metadata persisted in localStorage — followers and auto-progress mode.
 * Kept outside the locked Goal entity shape (additive client-side prefs).
 */

const FOLLOWERS_KEY = 'tasklytic:goalFollowers:v1'
const PROGRESS_MODE_KEY = 'tasklytic:goalProgressMode:v1'

type FollowersMap = Record<string, string[]>
type ProgressModeMap = Record<string, 'auto' | 'manual'>

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

/** User ids following a goal. */
export function getGoalFollowers(goalId: string): string[] {
  const map = readJson<FollowersMap>(FOLLOWERS_KEY, {})
  return map[goalId] ?? []
}

/** Whether a user follows a goal. */
export function isFollowingGoal(goalId: string, userId: string): boolean {
  return getGoalFollowers(goalId).includes(userId)
}

/** Toggle follow state; returns new following state. */
export function toggleGoalFollow(goalId: string, userId: string): boolean {
  const map = readJson<FollowersMap>(FOLLOWERS_KEY, {})
  const current = map[goalId] ?? []
  const next = current.includes(userId)
    ? current.filter((id) => id !== userId)
    : [...current, userId]
  map[goalId] = next
  writeJson(FOLLOWERS_KEY, map)
  return !current.includes(userId)
}

/** Goals followed by a user in a workspace. */
export function getFollowedGoalIds(userId: string, workspaceGoalIds: string[]): string[] {
  return workspaceGoalIds.filter((id) => isFollowingGoal(id, userId))
}

/** Progress computation mode for a goal (auto rollup vs manual metric). */
export function getGoalProgressMode(goalId: string): 'auto' | 'manual' {
  const map = readJson<ProgressModeMap>(PROGRESS_MODE_KEY, {})
  return map[goalId] ?? 'auto'
}

/** Set progress mode for a goal. */
export function setGoalProgressMode(goalId: string, mode: 'auto' | 'manual'): void {
  const map = readJson<ProgressModeMap>(PROGRESS_MODE_KEY, {})
  map[goalId] = mode
  writeJson(PROGRESS_MODE_KEY, map)
}
