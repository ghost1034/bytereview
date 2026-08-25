export type PbcRequestStatus = 'draft' | 'open' | 'submitted' | 'needs_changes' | 'accepted' | 'waived'
export type PbcEngagementStatus = 'draft' | 'active' | 'completed' | 'archived'
export type PbcEngagementType = 'audit' | 'tax' | 'bookkeeping' | 'advisory' | 'other'

export interface PbcTemplateItem {
  request_number?: string | null
  category?: string | null
  title: string
  description?: string | null
  priority: PbcRequestItem['priority']
  expected_filename?: string | null
  expected_formats: string[]
  gl_account?: string | null
  gl_balance?: string | null
  sensitive: boolean
  requires_redaction: boolean
  external_source_id?: string | null
}

export interface PbcTemplate {
  id: string
  name: string
  description?: string | null
  engagement_type: PbcEngagementType
  items: PbcTemplateItem[]
  created_at: string
  updated_at: string
}

export interface PbcDocument {
  id: string
  request_id: string
  filename: string
  mime_type: string
  size_bytes: number
  version: number
  state: string
  created_at: string
}

export interface PbcComment {
  id: string
  body: string
  visibility: 'client' | 'internal'
  actor_kind: 'firm' | 'client' | 'system'
  actor_name: string
  created_at: string
}

export interface PbcContact {
  id: string
  client_id?: string | null
  name: string
  email: string
  active: boolean
  role?: 'coordinator' | 'contributor' | null
  request_ids?: string[]
}

export interface PbcRequestItem {
  id: string
  engagement_id: string
  request_number: string
  sort_order: number
  category?: string | null
  title: string
  description?: string | null
  period_end?: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date?: string | null
  owner_user_id?: string | null
  owner_name?: string | null
  expected_filename?: string | null
  expected_formats: string[]
  gl_account?: string | null
  gl_balance?: string | null
  sensitive: boolean
  requires_redaction: boolean
  dependency_ids: string[]
  external_source_id?: string | null
  status: PbcRequestStatus
  status_reason?: string | null
  revision: number
  assignments: PbcContact[]
  documents: PbcDocument[]
  comments: PbcComment[]
  updated_at: string
}

export interface PbcEngagement {
  id: string
  firm_id: string
  client_id?: string | null
  name: string
  client_name: string
  engagement_type: PbcEngagementType
  period_start?: string | null
  period_end?: string | null
  due_date?: string | null
  owner_user_id?: string | null
  status: PbcEngagementStatus
  reminders_paused: boolean
  tasklytic_workspace_id?: string | null
  tasklytic_project_id?: string | null
  revision: number
  progress: number
  request_count: number
  status_counts: Record<string, number>
  contacts?: PbcContact[]
  firm_members?: Array<{ id: string; name: string; email: string }>
  requests?: PbcRequestItem[]
  activity?: Array<Record<string, unknown>>
  updated_at: string
}

export interface PbcClientEngagement extends PbcEngagement {
  contact: PbcContact
  portal_brand: {
    portal_name: string
    logo_url?: string | null
  }
}

export interface PbcDashboard {
  active_engagements: number
  total_requests: number
  accepted_requests: number
  awaiting_review: number
  overdue: number
  due_soon: number
  storage: {
    plan_code: string
    used_bytes: number
    reserved_bytes: number
    included_bytes: number
    remaining_bytes: number
  }
  engagements: PbcEngagement[]
}

export interface AnalyticsClientSummary {
  id: string
  name: string
  contact_name?: string | null
  contact_email?: string | null
}
