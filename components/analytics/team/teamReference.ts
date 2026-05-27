// Static reference content for the Team module's "Roles & Permissions" and
// "Target Personas" tabs. Ported from CPAAnalytics' TeamManagement, keyed to the
// backend role/persona enum values so labels stay in sync with the data model.

import {
  CheckSquare,
  Edit3,
  Eye,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { AnalyticsUserPersona, AnalyticsUserRole } from '@/lib/analytics/types'

export interface RoleDefinition {
  role: AnalyticsUserRole
  label: string
  description: string
  icon: LucideIcon
  iconClass: string
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'admin',
    label: 'Admin',
    description:
      'Full system access: user management, firm settings, billing, and every analytics module.',
    icon: Shield,
    iconClass: 'text-purple-600',
  },
  {
    role: 'manager',
    label: 'Manager',
    description:
      'All module access, team oversight, approval workflows, and client management.',
    icon: Users,
    iconClass: 'text-blue-600',
  },
  {
    role: 'analyst',
    label: 'Analyst',
    description:
      'Create, edit, and run analyses across all modules. Cannot manage users or firm settings.',
    icon: Edit3,
    iconClass: 'text-emerald-600',
  },
  {
    role: 'reviewer',
    label: 'Reviewer',
    description: 'View and approve or reject outputs. Cannot create or edit analyses.',
    icon: CheckSquare,
    iconClass: 'text-amber-600',
  },
  {
    role: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to reports and dashboards.',
    icon: Eye,
    iconClass: 'text-slate-500',
  },
]

export interface PersonaDefinition {
  persona: AnalyticsUserPersona
  label: string
  focus: string
  needs: string
}

export const PERSONA_DEFINITIONS: PersonaDefinition[] = [
  {
    persona: 'staff_accountant',
    label: 'Staff Accountant',
    focus: 'Data entry, schedule preparation, and reconciliation.',
    needs: 'Upload data, run analyses, and export results.',
  },
  {
    persona: 'senior_accountant',
    label: 'Senior Accountant',
    focus: 'Review, adjust, and approve work.',
    needs: 'Review AI outputs, make adjustments, and approve schedules.',
  },
  {
    persona: 'accounting_manager',
    label: 'Accounting Manager',
    focus: 'Oversee the team, manage clients, and ensure compliance.',
    needs: 'Dashboard views, team management, and client oversight.',
  },
  {
    persona: 'cpa_partner',
    label: 'CPA / Partner',
    focus: 'Final review, sign-off, and advisory.',
    needs: 'Executive summaries, audit-ready reports, and firm analytics.',
  },
]
