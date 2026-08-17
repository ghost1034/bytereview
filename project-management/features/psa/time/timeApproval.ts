import type { Workspace } from '../../../types'

type ApprovalEligibility = {
  eligible: boolean
  reason?: string
}

/** Mirror the backend time-approval policy so unavailable actions are clear before submission. */
export function getTimeApprovalEligibility(
  submitterId: string,
  approverId: string,
  workspace: Workspace | undefined,
): ApprovalEligibility {
  if (submitterId === approverId && !workspace?.approvalSettings?.allowSelfApproval) {
    return {
      eligible: false,
      reason: 'You cannot approve your own time under this workspace policy.',
    }
  }

  const routedApprovers = workspace?.approvalSettings?.timeApproverIds ?? []
  const isAdmin = workspace?.adminIds.includes(approverId) ?? false
  if (routedApprovers.length > 0 && !routedApprovers.includes(approverId) && !isAdmin) {
    return {
      eligible: false,
      reason: 'This approval is routed to another approver.',
    }
  }

  return { eligible: true }
}

/** Synchronously claim an action slot so rapid clicks cannot submit twice before React rerenders. */
export async function runApprovalOnce(
  inFlight: Set<string>,
  action: () => Promise<void>,
): Promise<boolean> {
  const key = 'approval-action'
  if (inFlight.has(key)) return false

  inFlight.add(key)
  try {
    await action()
    return true
  } finally {
    inFlight.delete(key)
  }
}

export function formatApprovalError(error: unknown): string {
  const detail = error && typeof error === 'object' && 'detail' in error
    ? (error as { detail?: unknown }).detail
    : undefined
  const code = detail && typeof detail === 'object' && 'code' in detail
    ? (detail as { code?: unknown }).code
    : undefined

  if (code === 'self_approval_denied') {
    return 'You cannot approve your own time under this workspace policy.'
  }
  if (code === 'approval_route_denied') {
    return 'This approval is routed to another approver.'
  }
  return error instanceof Error ? error.message : 'The approval request could not be completed.'
}
