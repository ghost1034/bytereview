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
export type AnalyticsProjectStatus = NonNullable<S['ProjectResponse']['status']>
export type AnalyticsProjectModule = NonNullable<S['ProjectResponse']['module']>

// Clients
export type AnalyticsClient = S['ClientResponse']
export type AnalyticsClientCreateRequest = S['ClientCreateRequest']
export type AnalyticsClientUpdateRequest = S['ClientUpdateRequest']
export type AnalyticsClientList = S['ClientListResponse']

// Projects
export type AnalyticsProject = S['ProjectResponse']
export type AnalyticsProjectCreateRequest = S['ProjectCreateRequest']
export type AnalyticsProjectUpdateRequest = S['ProjectUpdateRequest']
export type AnalyticsProjectList = S['ProjectListResponse']

// Analyses (variance + waterfall share the `analyses` table)
export type AnalyticsAnalysis = S['AnalysisResponse']
export type AnalyticsAnalysisCreateRequest = S['AnalysisCreateRequest']
export type AnalyticsAnalysisUpdateRequest = S['AnalysisUpdateRequest']
export type AnalyticsAnalysisList = S['AnalysisListResponse']

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

// Module IDs — used by the floating AI assistant to tailor the prompt.
export type AnalyticsModuleId =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'team'
  | 'variance'
  | 'reconciliation'
  | 'amortization'
  | 'waterfall'
  | 'irs-bot'
  | 'gaap-bot'
  | 'assistant'
  | 'settings'
