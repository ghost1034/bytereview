/**
 * Finish onboarding — provision templates, teams, fields, welcome inbox, analytics.
 */
import { track } from '../../lib/analytics/track'
import { ensureRecommendedFields } from '../../lib/customFields/seedRecommendedFields'
import { provisionPlan } from '../../lib/provisioning'
import { psaModeForIndustry, teamsForIndustry } from '../../lib/provisioning/industryTeams'
import { now } from '../../lib/time'
import type { ID, User } from '../../types'
import { useProjectsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'

export type CompleteOnboardingInput = {
  userId: ID
  workspaceId: ID
  companyName: string
  teamSize?: string
  industries?: string[]
  primaryUseCase?: string
  role?: string
  templateIds: ID[]
  skippedSteps: string[]
  startedAt: number
}

export type CompleteOnboardingResult = {
  projectIds: ID[]
  /** Best project to open after onboarding (provisioned, starter, or first in workspace). */
  targetProjectId: ID | null
}

/** Pick the project to land on after onboarding completes. */
export function resolveTargetProjectId(workspaceId: ID, provisionedIds: ID[]): ID | null {
  if (provisionedIds[0]) return provisionedIds[0]
  const projects = useProjectsStore
    .getState()
    .list()
    .filter((p) => p.workspaceId === workspaceId && !p.archived)
  return (
    projects.find((p) => p.name === 'Getting Started')?.id ??
    projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ??
    null
  )
}

/** Persist profile, provision content, and mark onboarding complete. */
export async function completeOnboarding(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  const workspaces = useWorkspacesStore.getState()
  const users = useUsersStore.getState()
  const workspace = workspaces.getById(input.workspaceId)
  const user = users.getById(input.userId)
  if (!workspace) {
    throw new Error('Workspace could not be loaded. Refresh the page and try again.')
  }
  if (!user) {
    throw new Error('Your user profile is not loaded yet. Wait a moment and try again.')
  }

  const primaryIndustry = input.industries?.[0] ?? 'General business'

  await workspaces.update(input.workspaceId, {
    name: input.companyName.trim() || workspace.name,
    profile: {
      ...workspace.profile,
      teamSize: input.teamSize,
      industry: primaryIndustry,
      industries: input.industries?.length ? input.industries : [primaryIndustry],
      primaryUseCase: input.primaryUseCase,
      role: input.role,
      signedUpAt: workspace.profile?.signedUpAt ?? now(),
    },
    psaMode: psaModeForIndustry(primaryIndustry) ?? workspace.psaMode,
  })

  const projects = input.templateIds.map((templateId) => ({ templateId }))
  const result = await provisionPlan({
    mode: 'enrich',
    workspaceId: input.workspaceId,
    ownerId: input.userId,
    workspace: {
      name: input.companyName.trim() || workspace.name,
      profile: {
        teamSize: input.teamSize,
        industry: primaryIndustry,
        industries: input.industries,
        primaryUseCase: input.primaryUseCase,
        role: input.role,
      },
      psaMode: psaModeForIndustry(primaryIndustry),
    },
    teams: teamsForIndustry(primaryIndustry),
    projects,
    removeStarterProject: input.templateIds.length > 0,
    inboxWelcome: {
      title: 'Welcome to the AI Project Management',
      body: "Here's what to try next — open your starter project, invite teammates, or take the product tour.",
      ctas: [
        { label: 'Open starter project', route: 'projects' },
        { label: 'Invite teammates', route: 'members' },
        { label: 'Take product tour', route: 'tour' },
      ],
    },
  })

  await ensureRecommendedFields(input.workspaceId, input.userId)

  const onboardingPatch: User['onboarding'] = {
    completedSteps: ['welcome', 'about', 'templates', 'invite', 'finish'],
    completed: true,
    completedAt: now(),
    skippedAt: input.skippedSteps.length ? now() : user.onboarding?.skippedAt,
  }

  await users.update(input.userId, { onboarding: onboardingPatch })

  track('onboarding_completed', {
    totalElapsedMs: Date.now() - input.startedAt,
    skippedSteps: input.skippedSteps.join(','),
    templateCount: input.templateIds.length,
    industry: input.industries?.join(', ') ?? '',
  })

  return {
    projectIds: result.projectIds,
    targetProjectId: resolveTargetProjectId(input.workspaceId, result.projectIds),
  }
}
