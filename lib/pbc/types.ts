export type PbcRequestStatus = 'draft' | 'open' | 'submitted' | 'needs_changes' | 'accepted' | 'waived'
export type PbcEngagementStatus = 'draft' | 'active' | 'completed' | 'archived'

export interface PbcDocument {
  id: string
  request_id: string
  filename: string
  mime_type: string
  size_bytes: number
  version: number
  state: string
  scan_status: string
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
}

export interface PbcRequestItem {
  id: string
  engagement_id: string
  request_number: string
  sort_order: number
  category?: string | null
  title: string
  description?: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date?: string | null
  owner_user_id?: string | null
  owner_name?: string | null
  expected_filename?: string | null
  expected_formats: string[]
  sensitive: boolean
  requires_redaction: boolean
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
  engagement_type: string
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
  requests?: PbcRequestItem[]
  activity?: Array<Record<string, unknown>>
  updated_at: string
}

export interface PbcDashboard {
  active_engagements: number
  total_requests: number
  accepted_requests: number
  awaiting_review: number
  overdue: number
  due_soon: number
  engagements: PbcEngagement[]
}

export interface AnalyticsClientSummary {
  id: string
  name: string
  contact_name?: string | null
  contact_email?: string | null
}

