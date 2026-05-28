import type { AnalyticsAnalysis, AnalyticsReconciliation } from '@/lib/analytics/types'

export type DashboardModuleId = 'variance' | 'reconciliation'

export interface UnifiedProject {
  id: string
  name: string
  clientId: string | null
  clientName: string
  moduleId: DashboardModuleId
  moduleLabel: 'Variance' | 'Reconciliation'
  status: string
  bucket: StatusBucket
  updatedAt: Date
}

export type StatusBucket = 'pending' | 'in_prep' | 'approved' | 'finalized' | 'other'

export interface KpiCounts {
  total: number
  pending: number
  inPrep: number
  approved: number
  finalized: number
}

const INTERNAL_GENERAL = 'Internal / General'

// Variance stores statuses as TitleCase free-form strings (e.g. "Draft", "In
// Review"); reconciliation stores lowercase enum values ("draft", "in_review",
// "approved", "finalized"). Normalize to a stable lowercase shape before
// bucketing so KPI counts catch both vocabularies.
function normalize(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function bucketForStatus(status: string | null | undefined): StatusBucket {
  switch (normalize(status)) {
    case 'pending_review':
    case 'in_review':
      return 'pending'
    case 'in_prep':
    case 'draft':
      return 'in_prep'
    case 'approved':
    case 'completed':
      return 'approved'
    case 'finalized':
      return 'finalized'
    default:
      return 'other'
  }
}

function clientNameFor(
  clientId: string | null | undefined,
  clientNameById: Map<string, string>,
): string {
  if (!clientId) return INTERNAL_GENERAL
  return clientNameById.get(clientId) ?? INTERNAL_GENERAL
}

function parseDate(value: string | null | undefined, fallback: string): Date {
  const raw = value ?? fallback
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

export function toUnifiedFromVariance(
  row: AnalyticsAnalysis,
  clientNameById: Map<string, string>,
): UnifiedProject {
  return {
    id: row.id,
    name: row.name || 'Unnamed Project',
    clientId: row.client_id ?? null,
    clientName: clientNameFor(row.client_id, clientNameById),
    moduleId: 'variance',
    moduleLabel: 'Variance',
    status: row.status || 'Draft',
    bucket: bucketForStatus(row.status),
    updatedAt: parseDate(row.updated_at, row.created_at),
  }
}

export function toUnifiedFromReconciliation(
  row: AnalyticsReconciliation,
  clientNameById: Map<string, string>,
): UnifiedProject {
  return {
    id: row.id,
    name: row.name || 'Unnamed Project',
    clientId: row.client_id ?? null,
    clientName: clientNameFor(row.client_id, clientNameById),
    moduleId: 'reconciliation',
    moduleLabel: 'Reconciliation',
    status: row.status || 'draft',
    bucket: bucketForStatus(row.status),
    updatedAt: parseDate(row.updated_at, row.created_at),
  }
}

export function countByBucket(projects: UnifiedProject[]): KpiCounts {
  const counts: KpiCounts = { total: projects.length, pending: 0, inPrep: 0, approved: 0, finalized: 0 }
  for (const p of projects) {
    switch (p.bucket) {
      case 'pending':
        counts.pending += 1
        break
      case 'in_prep':
        counts.inPrep += 1
        break
      case 'approved':
        counts.approved += 1
        break
      case 'finalized':
        counts.finalized += 1
        break
    }
  }
  return counts
}
