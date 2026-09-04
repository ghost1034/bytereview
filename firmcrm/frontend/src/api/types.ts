export type Role = "admin" | "partner" | "manager" | "staff" | "marketing";
export interface User { id: number; email: string; full_name: string; role: Role; title?: string | null; practice_area_id?: number | null; is_active: boolean; must_change_password?: boolean; last_login_at?: string | null }
export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface TokenPair { access_token: string; refresh_token: string; expires_in: number; user: User }
export interface SessionInfo { id: number; created_at: string; expires_at: string; ip: string | null; user_agent: string | null }
export interface ImportJob { id: number; entity: string; filename: string; dry_run: boolean; status: string; total_rows: number; created_rows: number; updated_rows: number; skipped_rows: number; exceptions: { row: number; field: string | null; message: string; data: Record<string, string> }[]; actor_id: number | null; actor_name?: string | null; created_at: string }
export interface PracticeArea { id: number; name: string; discipline: string; clearance_type: "conflict" | "independence" | null; is_active: boolean }
export interface Stage { id: number; pipeline_id: number; name: string; position: number; probability: number; is_won: boolean; is_lost: boolean }
export interface Pipeline { id: number; name: string; is_default: boolean; stages: Stage[] }

export interface Account {
  id: number; name: string; aliases?: string | null; account_type: string; entity_kind: string; industry?: string | null;
  website?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null; country: string;
  revenue_band?: string | null; employee_band?: string | null; owner_id?: number | null; originating_partner_id?: number | null;
  referral_account_id?: number | null; referral_contact_id?: number | null; client_since?: string | null; risk_rating?: string | null;
  is_public_company: boolean; tags: string[]; description?: string | null; created_at: string; updated_at: string;
  owner_name?: string | null; originating_partner_name?: string | null; open_pipeline: number; contact_count: number;
  engagement_count: number; last_activity_at?: string | null; is_archived: boolean; archived_at?: string | null;
}
export interface Contact {
  id: number; first_name: string; last_name: string; full_name: string; email?: string | null; phone?: string | null; title?: string | null;
  account_id?: number | null; role?: string | null; owner_id?: number | null; lifecycle: string; do_not_contact: boolean; linkedin?: string | null;
  notes?: string | null; account_name?: string | null; owner_name?: string | null; last_activity_at?: string | null; created_at: string; is_archived: boolean;
}
export interface Lead {
  id: number; first_name: string; last_name: string; company?: string | null; email?: string | null; phone?: string | null; title?: string | null;
  source: string; status: string; practice_area_id?: number | null; owner_id?: number | null; campaign_id?: number | null;
  referral_contact_id?: number | null; estimated_value?: number | null; need_summary?: string | null; score: number;
  unqualified_reason?: string | null; owner_name?: string | null; practice_area_name?: string | null; converted_account_id?: number | null;
  converted_contact_id?: number | null; converted_opportunity_id?: number | null; converted_at?: string | null; created_at: string; is_archived: boolean;
}
export interface Opportunity {
  id: number; name: string; account_id: number; primary_contact_id?: number | null; pipeline_id: number; stage_id: number;
  practice_area_id?: number | null; owner_id?: number | null; originating_partner_id?: number | null; responsible_partner_id?: number | null;
  referral_contact_id?: number | null; referral_account_id?: number | null; campaign_id?: number | null; amount: number; fee_type: string;
  is_recurring: boolean; probability: number; expected_close?: string | null; proposal_due?: string | null; engagement_letter_status: string;
  competitor?: string | null; adverse_parties: string[]; description?: string | null; next_step?: string | null; status: "open" | "won" | "lost";
  closed_at?: string | null; lost_reason?: string | null; last_activity_at?: string | null; stage_entered_at: string; created_at: string;
  updated_at: string; account_name?: string | null; stage_name?: string | null; stage_position?: number | null; practice_area_name?: string | null;
  owner_name?: string | null; originating_partner_name?: string | null; primary_contact_name?: string | null; weighted_amount: number;
  days_in_stage: number; is_stale: boolean; clearance_type?: "conflict" | "independence" | null; clearance_status?: string | null; is_archived: boolean;
}
export interface StageHistory { id: number; from_stage_id: number | null; to_stage_id: number; changed_at: string; days_in_previous: number | null; from_stage_name?: string | null; to_stage_name?: string | null; changed_by_name?: string | null }
export interface Activity {
  id: number; kind: "call" | "email" | "meeting" | "note" | "task"; subject: string; body?: string | null; owner_id?: number | null;
  account_id?: number | null; contact_id?: number | null; opportunity_id?: number | null; lead_id?: number | null; due_at?: string | null;
  occurred_at?: string | null; completed_at?: string | null; priority: string; created_at: string; owner_name?: string | null;
  account_name?: string | null; contact_name?: string | null; opportunity_name?: string | null; lead_name?: string | null;
}
export interface ConflictMatch { party: string; matched_name: string; entity: string; entity_id: number | null; relationship: string; context?: string | null; score: number; restricted?: boolean }
export interface ConflictCheck {
  id: number; check_type: "conflict" | "independence"; opportunity_id?: number | null; account_id?: number | null; requested_by_id?: number | null;
  parties: string[]; matches: ConflictMatch[]; status: "pending" | "clear" | "conflict" | "waived"; resolution_note?: string | null;
  resolved_by_id?: number | null; resolved_at?: string | null; independence_attestation?: Record<string, boolean> | null; created_at: string;
  requested_by_name?: string | null; resolved_by_name?: string | null; opportunity_name?: string | null; account_name?: string | null;
}
export interface Engagement {
  id: number; name: string; account_id: number; opportunity_id?: number | null; practice_area_id?: number | null; responsible_partner_id?: number | null;
  originating_partner_id?: number | null; status: string; fee_type: string; annual_value: number; start_date?: string | null; end_date?: string | null;
  adverse_parties: string[]; external_ref?: string | null; created_at: string; account_name?: string | null; practice_area_name?: string | null;
  responsible_partner_name?: string | null;
}
export interface Campaign {
  id: number; name: string; kind: string; status: string; start_date?: string | null; end_date?: string | null; budget: number; actual_cost: number;
  owner_id?: number | null; practice_area_id?: number | null; description?: string | null; created_at: string; member_count: number;
  attended_count: number; leads_generated: number; influenced_pipeline: number; won_amount: number; is_archived: boolean;
}
export interface CampaignMember { id: number; contact_id: number; status: string; added_at: string; contact_name?: string | null; contact_email?: string | null; account_name?: string | null }
export interface AuditRow { id: number; at: string; actor_id: number | null; actor_name?: string | null; action: string; entity_type: string; entity_id: string | null; before_json: string | null; after_json: string | null; note: string | null }

export interface PipelineStageSummary { stage_id: number; stage: string; position: number; count: number; amount: number; weighted: number; stale: number }
export interface PipelineSummary { stages: PipelineStageSummary[]; total_count: number; total_amount: number; total_weighted: number; stale_count: number }
export interface WinLoss {
  won_count: number; lost_count: number; won_amount: number; lost_amount: number; win_rate: number | null; avg_won_amount: number;
  avg_days_to_close: number | null; lost_reasons: { reason: string; count: number }[];
  monthly: { month: string; won: number; lost: number; won_count: number; lost_count: number }[];
}
export interface Dashboard {
  kpis: Record<string, number>; pipeline: PipelineSummary; win_loss: WinLoss;
  my_tasks: { id: number; subject: string; due_at: string | null; priority: string; opportunity_id: number | null; account_id: number | null; account_name?: string | null; opportunity_name?: string | null }[];
}
export interface WallMember { user_id: number; full_name: string; role: string; added_at: string }
export interface Wall { id: number; entity_type: "account" | "opportunity"; entity_id: number; entity_name: string | null; reason: string; is_active: boolean; created_by_id: number | null; created_by_name: string | null; created_at: string; deactivated_at: string | null; members: WallMember[] }
