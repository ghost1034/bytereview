// Friendly aliases for analytics schemas defined in the generated OpenAPI types.
// Re-export everything analytics modules need from a single import site.
import type { components } from '@/lib/api-types'

type S = components['schemas']

// Firms / team
export type AnalyticsFirm = S['FirmResponse']
export type AnalyticsFirmDetail = S['FirmDetailResponse']
export type AnalyticsFirmMember = S['FirmMemberResponse']
export type AnalyticsFirmUpdateRequest = S['FirmUpdateRequest']
export type AnalyticsFirmInviteRequest = S['FirmInviteRequest']
export type AnalyticsMemberUpdateRequest = S['MemberUpdateRequest']

// Role / persona / status / module enums (Phase 5.1)
export type AnalyticsUserRole = NonNullable<S['MemberUpdateRequest']['role']>
export type AnalyticsUserPersona = NonNullable<S['MemberUpdateRequest']['persona']>
// Clients
export type AnalyticsClient = S['ClientResponse']
export type AnalyticsClientCreateRequest = S['ClientCreateRequest']
export type AnalyticsClientUpdateRequest = S['ClientUpdateRequest']
export type AnalyticsClientList = S['ClientListResponse']

// Analyses (variance + waterfall share the `analyses` table)
export type AnalyticsAnalysis = S['AnalysisResponse']
export type AnalyticsAnalysisCreateRequest = S['AnalysisCreateRequest']
export type AnalyticsAnalysisUpdateRequest = S['AnalysisUpdateRequest']
export type AnalyticsAnalysisList = S['AnalysisListResponse']

// Variance LLM
export type AnalyticsVarianceThresholdRequest = S['VarianceThresholdRequest']
export type AnalyticsVarianceThresholdResponse = S['VarianceThresholdResponse']
export type AnalyticsVarianceAnalyzeRequest = S['VarianceAnalyzeRequest']
export type AnalyticsVarianceAnalyzeResponse = S['VarianceAnalyzeResponse']
export type AnalyticsVarianceMemoRequest = S['VarianceMemoRequest']
export type AnalyticsVarianceMemoResponse = S['VarianceMemoResponse']

// Waterfall LLM extraction
export type AnalyticsWaterfallExtractRequest = S['WaterfallExtractRequest']
export type AnalyticsWaterfallExtractResponse = S['WaterfallExtractResponse']

// Amortization
export type AnalyticsAmortization = S['AmortizationResponse']
export type AnalyticsAmortizationCreateRequest = S['AmortizationCreateRequest']
export type AnalyticsAmortizationUpdateRequest = S['AmortizationUpdateRequest']
export type AnalyticsAmortizationList = S['AmortizationListResponse']
export type AnalyticsAmortizationExtractRequest = S['AmortizationExtractRequest']
export type AnalyticsAmortizationExtractResponse = S['AmortizationExtractResponse']
export type AnalyticsAmortizationComplianceRequest = S['AmortizationComplianceRequest']
export type AnalyticsAmortizationComplianceResponse = S['AmortizationComplianceResponse']
export type AnalyticsAmortizationScheduleRequest = S['AmortizationScheduleRequest']
export type AnalyticsAmortizationScheduleResponse = S['AmortizationScheduleResponse']
export type AnalyticsJournalEntry = S['JournalEntryResponse']
export type AnalyticsJournalEntryCreateRequest = S['JournalEntryCreateRequest']
export type AnalyticsJournalEntryList = S['JournalEntryListResponse']

// Reconciliation
export type AnalyticsReconciliation = S['ReconciliationRecord']
export type AnalyticsReconciliationListResponse = S['ReconciliationListResponse']
export type AnalyticsReconciliationCreateRequest = S['ReconciliationCreateRequest']
export type AnalyticsReconciliationUpdateRequest = S['ReconciliationUpdateRequest']
export type AnalyticsReconciliationRulesGenerateRequest = S['ReconciliationRulesGenerateRequest']
export type AnalyticsReconciliationRulesGenerateResponse = S['ReconciliationRulesGenerateResponse']
export type AnalyticsReconciliationAdditionalPassRequest = S['ReconciliationAdditionalPassRequest']
export type AnalyticsReconciliationAdditionalPassResponse = S['ReconciliationAdditionalPassResponse']
export type AnalyticsReconciliationMatchRequest = S['ReconciliationMatchRequest']
export type AnalyticsReconciliationMatchResponse = S['ReconciliationMatchResponse']
export type AnalyticsReconciliationBasicRequest = S['ReconciliationBasicRequest']
export type AnalyticsReconciliationManualMatchRequest = S['ReconciliationManualMatchRequest']
export type AnalyticsReconciliationStatus = NonNullable<S['ReconciliationRecord']['status']>

// Chat — shared
export type AnalyticsChatMessage = S['ChatMessage']
export type AnalyticsChatSession = S['ChatSessionResponse']
export type AnalyticsChatSessionList = S['ChatSessionListResponse']
export type AnalyticsChatSessionUpdateRequest = S['ChatSessionUpdateRequest']
export type AnalyticsUploadedDoc = S['UploadedDoc']

// Document extraction (research bots / assistant)
export type AnalyticsDocumentExtractRequest = S['DocumentExtractRequest']
export type AnalyticsDocumentExtractResponse = S['DocumentExtractResponse']

// Streaming requests
export type AnalyticsAssistantStreamRequest = S['AssistantStreamRequest']
export type AnalyticsResearchStreamRequest = S['ResearchStreamRequest']

// Usage metadata
export type AnalyticsUsageMetadata = S['UsageMetadata']

// Comments (generic per-entity threads with @mentions)
export type AnalyticsComment = S['CommentResponse']
export type AnalyticsCommentList = S['CommentListResponse']
export type AnalyticsCommentCreateRequest = S['CommentCreateRequest']
export type AnalyticsCommentUpdateRequest = S['CommentUpdateRequest']

// Settings (audit logs, firm-wide export)
export type AnalyticsAuditLogEntry = S['AuditLogEntry']
export type AnalyticsAuditLogsResponse = S['AuditLogsResponse']
export type AnalyticsFirmExport = S['FirmExportResponse']

// Module IDs — used by the floating AI assistant to tailor the prompt.
export type AnalyticsModuleId =
  | 'dashboard'
  | 'clients'
  | 'team'
  | 'variance'
  | 'reconciliation'
  | 'amortization'
  | 'waterfall'
  | 'irs-bot'
  | 'gaap-bot'
  | 'assistant'
  | 'settings'
