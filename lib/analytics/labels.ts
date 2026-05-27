// Display labels, badge tones, and option lists for analytics enums.
// Backend sends lowercase snake_case enum values (see backend/models/analytics.py);
// these maps turn them into human-readable text and consistent badge styling.

import type {
  AnalyticsProjectModule,
  AnalyticsProjectStatus,
  AnalyticsUserPersona,
  AnalyticsUserRole,
} from '@/lib/analytics/types'

// --- Project status ---------------------------------------------------------

export const PROJECT_STATUS_LABELS: Record<AnalyticsProjectStatus, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
  archived: 'Archived',
}

/** Semantic-token Badge classes per status (mirrors components/ui/job-status-badge.tsx). */
export const PROJECT_STATUS_BADGE_CLASS: Record<AnalyticsProjectStatus, string> = {
  draft: 'border-border bg-surface-muted text-foreground-muted',
  in_progress: 'border-info/20 bg-info-soft text-info',
  in_review: 'border-warning/30 bg-warning-soft text-warning',
  approved: 'border-success/20 bg-success-soft text-success',
  archived: 'border-border bg-surface-muted text-foreground-subtle',
}

export const PROJECT_STATUS_OPTIONS: AnalyticsProjectStatus[] = [
  'draft',
  'in_progress',
  'in_review',
  'approved',
  'archived',
]

// --- Project module ---------------------------------------------------------

export const PROJECT_MODULE_LABELS: Record<AnalyticsProjectModule, string> = {
  variance: 'Variance',
  reconciliation: 'Reconciliation',
  amortization: 'Amortization',
  waterfall: 'Waterfall',
  irs: 'IRS Researcher',
  gaap: 'GAAP Researcher',
  assistant: 'AI Assistant',
  other: 'Other',
}

export const PROJECT_MODULE_OPTIONS: AnalyticsProjectModule[] = [
  'other',
  'variance',
  'reconciliation',
  'amortization',
  'waterfall',
  'irs',
  'gaap',
  'assistant',
]

// --- Member role ------------------------------------------------------------

export const USER_ROLE_LABELS: Record<AnalyticsUserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  analyst: 'Analyst',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
}

export const USER_ROLE_OPTIONS: AnalyticsUserRole[] = [
  'admin',
  'manager',
  'analyst',
  'reviewer',
  'viewer',
]

// --- Member persona ---------------------------------------------------------

export const USER_PERSONA_LABELS: Record<AnalyticsUserPersona, string> = {
  staff_accountant: 'Staff Accountant',
  senior_accountant: 'Senior Accountant',
  accounting_manager: 'Accounting Manager',
  cpa_partner: 'CPA / Partner',
}

export const USER_PERSONA_OPTIONS: AnalyticsUserPersona[] = [
  'staff_accountant',
  'senior_accountant',
  'accounting_manager',
  'cpa_partner',
]

// --- Role-based UI gating (backend RBAC is authoritative; this is UX only) ---

/** Roles allowed to create/update/delete clients & projects. */
export const ANALYTICS_WRITER_ROLES: AnalyticsUserRole[] = ['admin', 'manager', 'analyst']

export function canWrite(role?: AnalyticsUserRole | null): boolean {
  return !!role && ANALYTICS_WRITER_ROLES.includes(role)
}

export function isAdmin(role?: AnalyticsUserRole | null): boolean {
  return role === 'admin'
}
