/**
 * Declarative provisioning plan types — shared by onboarding, trial, and evaluation flows.
 */
import type { ID, ISODateTime, ProjectStatus, ProjectView } from '../../types'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'

export type WorkspaceProfileInput = {
  teamSize?: string
  industry?: string
  industries?: string[]
  primaryUseCase?: string
  role?: string
  signedUpAt?: ISODateTime
}

export type ProvisioningTeamSpec = {
  name: string
  iconEmoji?: string
  visibility?: 'public' | 'private'
}

export type ProvisioningMemberSpec = {
  name: string
  email: string
  role: WorkspaceRole
  teamNames?: string[]
  jobTitle?: string
}

export type ProvisioningProjectSpec = {
  templateId?: ID
  name?: string
  defaultView?: ProjectView
  status?: ProjectStatus
  teamName?: string
  parentProjectName?: string
  skipSiblings?: boolean
}

export type ProvisioningGoalSpec = {
  name: string
  description?: string
  metricTarget?: number
  metricCurrent?: number
}

export type ProvisioningPortfolioSpec = {
  name: string
  description?: string
  projectNames?: string[]
}

export type InboxWelcomeSpec = {
  title: string
  body: string
  ctas?: Array<{ label: string; route: string }>
}

export type PsaRateTierSpec = { role: string; hourlyRate: number }

export type PsaProvisioningSpec = {
  clients?: Array<{ name: string; industry?: string }>
  rateCardName?: string
  rateTiers?: PsaRateTierSpec[]
  sampleTimeEntryCount?: number
}

export type ProvisioningPlan = {
  /** create = new workspace; enrich = update existing workspace in place */
  mode?: 'create' | 'enrich'
  workspaceId?: ID
  ownerId: ID
  ownerName?: string
  ownerEmail?: string
  workspace: {
    name: string
    iconEmoji?: string
    profile?: WorkspaceProfileInput
    psaMode?: 'legal' | 'accounting' | 'generic' | 'advisory'
    defaultCurrency?: string
  }
  teams?: ProvisioningTeamSpec[]
  members?: ProvisioningMemberSpec[]
  projects?: ProvisioningProjectSpec[]
  goals?: ProvisioningGoalSpec[]
  portfolios?: ProvisioningPortfolioSpec[]
  inboxWelcome?: InboxWelcomeSpec
  psa?: PsaProvisioningSpec
  removeStarterProject?: boolean
}

export type ProvisioningStep =
  | 'workspace'
  | 'teams'
  | 'members'
  | 'fields'
  | 'projects'
  | 'goals'
  | 'portfolios'
  | 'psa'
  | 'inbox'
  | 'done'

export type ProvisionOptions = {
  seedRng?: number
  emitProgress?: (step: ProvisioningStep) => void
}

export type ProvisionResult = {
  workspaceId: ID
  projectIds: ID[]
  teamIds: ID[]
}
