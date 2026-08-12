/** Repository adapter types — persistence seam for Tasklytic. */
import type { ID } from '../../types'

export const TASKLYTIC_CAPABILITIES = [
  'view',
  'edit',
  'submit',
  'approve',
  'bill',
  'payment',
  'trust',
  'rate',
  'workspace-administration',
] as const

export type TasklyticCapability = (typeof TASKLYTIC_CAPABILITIES)[number]
export type TasklyticCapabilities = Record<TasklyticCapability, boolean>
export type RevisionedRecord = { id?: ID; revision?: number }
export type IdentifiedRevisionedRecord = RevisionedRecord & { id: ID }

export type EntityKind =
  | 'workspaces'
  | 'teams'
  | 'users'
  | 'projects'
  | 'sections'
  | 'tasks'
  | 'customFields'
  | 'comments'
  | 'activity'
  | 'attachments'
  | 'tags'
  | 'forms'
  | 'formSubmissions'
  | 'rules'
  | 'goals'
  | 'portfolios'
  | 'statusUpdates'
  | 'projectMessages'
  | 'notifications'
  | 'savedViews'
  | 'dashboards'
  | 'templates'
  | 'session'
  | 'pendingEmails'
  | 'workspaceInvitations'
  | 'timeEntries'
  | 'expenses'
  | 'invoices'
  | 'clients'
  | 'matters'
  | 'billingRates'
  | 'rateCards'
  | 'timesheets'
  | 'expenseReports'
  | 'payments'
  | 'trustTransactions'
  | 'reimbursementBatches'
  | 'billingInquiries'
  | 'teamJoinRequests'

export type RepositorySnapshot = {
  workspaceId: ID | null
  collections: Partial<Record<EntityKind, unknown[]>>
  capabilities?: TasklyticCapabilities | null
  generatedAt: string
}

export type ProvisioningResult = {
  workspace: Record<string, unknown> & { id: ID }
  bootstrap: RepositorySnapshot
  created: boolean
}

export interface RepositoryAdapter {
  loadAll<T>(entity: EntityKind): Promise<T[]>
  saveAll<T extends RevisionedRecord>(entity: EntityKind, items: T[]): Promise<T[]>
  upsertOne<T extends IdentifiedRevisionedRecord>(entity: EntityKind, item: T): Promise<T>
  removeOne(entity: EntityKind, id: ID): Promise<void>
  clearAll(): Promise<void>
  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void
  readonly schemaVersion: number
  migrateIfNeeded(): Promise<void>
  refreshSnapshot?(workspaceId?: ID | null): Promise<RepositorySnapshot>
  connectWorkspaceEvents?(workspaceId: ID): () => void
  provision?(bundle: unknown): Promise<ProvisioningResult | void>
}
