import { resolveRate, computeTimeAmount } from '../billing/resolveRate'
import { newId } from '../ids'
import { now } from '../time'
import type {
  BillingRate,
  ID,
  ISODate,
  Matter,
  Project,
  RateCard,
  RateSource,
  TimeEntry,
  User,
  Workspace,
} from '../../types'

export type BuildTimeEntryInput = {
  workspaceId: ID
  userId: ID
  user?: User
  date: ISODate
  hours: number
  description: string
  billable: boolean
  taskId?: ID
  projectId?: ID
  matterId?: ID
  clientId?: ID
  activityCode?: string
  taskCode?: string
  rateOverride?: number
  rateOverrideReason?: string
  startedAt?: string
  stoppedAt?: string
  workspace?: Workspace
  matter?: Matter
  project?: Project
  billingRates: BillingRate[]
  rateCards: RateCard[]
}

/** Build a draft time entry with resolved rate snapshot. */
export function buildTimeEntry(input: BuildTimeEntryInput): TimeEntry {
  const resolved = resolveRate({
    workspaceId: input.workspaceId,
    userId: input.userId,
    user: input.user,
    date: input.date,
    matterId: input.matterId,
    projectId: input.projectId,
    clientId: input.clientId,
    matter: input.matter,
    project: input.project,
    billingRates: input.billingRates,
    rateCards: input.rateCards,
    defaultCurrency: input.workspace?.defaultCurrency,
  })
  const rate = input.rateOverride ?? resolved.hourlyRate
  const amount = computeTimeAmount(input.hours, rate, input.billable)
  const ts = now()
  return {
    id: newId(),
    workspaceId: input.workspaceId,
    userId: input.userId,
    taskId: input.taskId,
    projectId: input.projectId,
    matterId: input.matterId,
    clientId: input.clientId,
    description: input.description,
    hours: input.hours,
    durationMinutes: Math.round(input.hours * 60),
    date: input.date,
    startedAt: input.startedAt,
    stoppedAt: input.stoppedAt,
    billable: input.billable,
    rateSnapshot: rate,
    rateSource: input.rateOverride !== undefined ? ('override' as RateSource) : resolved.rateSource,
    rateOverrideReason: rate === 0 ? input.rateOverrideReason?.trim() || undefined : undefined,
    currency: resolved.currency,
    amount,
    activityCode: input.activityCode,
    taskCode: input.taskCode,
    status: 'draft',
    approved: false,
    invoiced: false,
    createdAt: ts,
    modifiedAt: ts,
  }
}
