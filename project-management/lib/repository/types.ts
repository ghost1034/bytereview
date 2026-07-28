/** Repository adapter types — persistence seam for Tasklytic. */
import type { ID } from '../../types'

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

export interface RepositoryAdapter {
  loadAll<T>(entity: EntityKind): Promise<T[]>
  saveAll<T>(entity: EntityKind, items: T[]): Promise<void>
  upsertOne<T extends { id: ID }>(entity: EntityKind, item: T): Promise<void>
  removeOne(entity: EntityKind, id: ID): Promise<void>
  clearAll(): Promise<void>
  subscribe(entity: EntityKind, cb: (items: unknown[]) => void): () => void
  readonly schemaVersion: number
  migrateIfNeeded(): Promise<void>
  provision?(plan: unknown): Promise<void>
}
