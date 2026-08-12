import type {
  EntityKind,
  TasklyticCapabilities,
  TasklyticCapability,
} from './repository/types'

type MutablePayload = { status?: unknown }

export function requiredCapabilityForMutation(
  entity: EntityKind,
  next: MutablePayload,
  previous?: MutablePayload,
): TasklyticCapability {
  if (entity === 'workspaces') return 'workspace-administration'
  if (entity === 'workspaceInvitations') return 'workspace-administration'
  if (entity === 'users' && previous) {
    const privilegeFields = ['role', 'roleFlags', 'defaultHourlyRate', 'timekeeperRole', 'timekeeperId']
    if (privilegeFields.some((field) => (
      (next as Record<string, unknown>)[field] !== (previous as Record<string, unknown>)[field]
    ))) return 'workspace-administration'
  }
  if (entity === 'billingRates' || entity === 'rateCards' || entity === 'activityCodes' || entity === 'billingBudgets' || entity === 'fxQuotes' || entity === 'fxRateCache') return 'rate'
  if (entity === 'invoices' || entity === 'reimbursementBatches' || entity === 'billingLocks' || entity === 'billingAuditRecords') return 'bill'
  if (entity === 'payments') return 'payment'
  if (entity === 'trustTransactions') return 'trust'
  if ((next.status === 'approved' || next.status === 'rejected' || next.status === 'partially_approved') && next.status !== previous?.status) {
    return 'approve'
  }
  if (['billed', 'written_off', 'locked', 'reimbursed'].includes(String(next.status)) && next.status !== previous?.status) return 'bill'
  if (next.status === 'submitted' && next.status !== previous?.status) return 'submit'
  return 'edit'
}

export function hasCapability(
  capabilities: TasklyticCapabilities | null | undefined,
  capability: TasklyticCapability,
): boolean {
  return capabilities?.[capability] === true
}

export class TasklyticForbiddenError extends Error {
  constructor(readonly capability: TasklyticCapability) {
    super(`Tasklytic action requires the ${capability} capability`)
    this.name = 'TasklyticForbiddenError'
  }
}
