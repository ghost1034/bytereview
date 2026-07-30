import type { WorkspacePlan } from '../../types'

/** Default free-tier plan for new workspaces. */
export const DEFAULT_FREE_PLAN: WorkspacePlan = {
  tier: 'free',
  seatLimit: 10,
}

/** Resolve workspace plan with free-tier fallback. */
export function resolveWorkspacePlan(plan?: WorkspacePlan): WorkspacePlan {
  return plan ?? DEFAULT_FREE_PLAN
}
