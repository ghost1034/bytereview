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

// Chat — shared
export type AnalyticsChatMessage = S['ChatMessage']
export type AnalyticsChatSession = S['ChatSessionResponse']
export type AnalyticsChatSessionList = S['ChatSessionListResponse']
export type AnalyticsChatSessionUpdateRequest = S['ChatSessionUpdateRequest']

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
