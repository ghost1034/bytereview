// Display labels, badge tones, and option lists for analytics enums.
// Backend sends lowercase snake_case enum values (see backend/models/analytics.py);
// these maps turn them into human-readable text and consistent badge styling.

import type {
  AnalyticsUserPersona,
  AnalyticsUserRole,
} from '@/lib/analytics/types'

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

/** Roles allowed to create/update/delete clients. */
export const ANALYTICS_WRITER_ROLES: AnalyticsUserRole[] = ['admin', 'manager', 'analyst']

export function canWrite(role?: AnalyticsUserRole | null): boolean {
  return !!role && ANALYTICS_WRITER_ROLES.includes(role)
}

export function isAdmin(role?: AnalyticsUserRole | null): boolean {
  return role === 'admin'
}

/** CPAAnalytics settings surface only Admin vs User labels. */
export function settingsRoleLabel(role?: AnalyticsUserRole | null): string {
  return isAdmin(role) ? 'Admin' : 'User'
}
