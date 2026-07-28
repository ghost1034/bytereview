/**
 * Unified provisioning engine — workspaces, teams, projects, goals, PSA, inbox.
 */
import { colorForUser } from '../colors'
import { ensureRecommendedFields } from '../customFields/seedRecommendedFields'
import { newId } from '../ids'
import { track } from '../analytics/track'
import { instantiateTemplate } from '../templates/instantiateTemplate'
import { now } from '../time'
import type { Goal, ID, Notification, Portfolio, Team, User, Workspace } from '../../types'
import {
  useGoalsStore,
  useNotificationsStore,
  usePortfoliosStore,
  useProjectsStore,
  useSectionsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../stores/entities'
import { attachOwnerToTeams, provisionMembers } from './executeMembers'
import { provisionPsaData } from './executePsa'
import type { ProvisionOptions, ProvisionResult, ProvisioningPlan, ProvisioningStep } from './types'

function emit(opts: ProvisionOptions | undefined, step: ProvisioningStep): void {
  opts?.emitProgress?.(step)
}

async function ensureTeams(
  workspaceId: ID,
  ownerId: ID,
  specs: ProvisioningPlan['teams']
): Promise<{ teams: Team[]; nameToId: Map<string, ID> }> {
  const teamsStore = useTeamsStore.getState()
  const existing = teamsStore.list().filter((t) => t.workspaceId === workspaceId)
  const nameToId = new Map<string, ID>()
  const teams: Team[] = [...existing]

  for (const spec of specs ?? []) {
    const found = existing.find((t) => t.name === spec.name)
    if (found) {
      nameToId.set(spec.name, found.id)
      continue
    }
    const team: Team = {
      id: newId(),
      workspaceId,
      name: spec.name,
      iconEmoji: spec.iconEmoji ?? '👥',
      memberIds: [ownerId],
      adminIds: [ownerId],
      privacy: spec.visibility === 'private' ? 'private' : 'public',
    }
    await teamsStore.add(team)
    teams.push(team)
    nameToId.set(spec.name, team.id)
  }

  if (teams.length === 0) {
    const fallback: Team = {
      id: newId(),
      workspaceId,
      name: 'General',
      iconEmoji: '👥',
      memberIds: [ownerId],
      adminIds: [ownerId],
      privacy: 'public',
    }
    await teamsStore.add(fallback)
    teams.push(fallback)
    nameToId.set(fallback.name, fallback.id)
  }

  await attachOwnerToTeams(ownerId, teams)
  return { teams, nameToId }
}

/** Execute a declarative provisioning plan against repository stores. */
export async function provisionPlan(
  plan: ProvisioningPlan,
  opts?: ProvisionOptions
): Promise<ProvisionResult> {
  const mode = plan.mode ?? 'create'
  const workspacesStore = useWorkspacesStore.getState()
  let workspaceId = plan.workspaceId
  const projectIds: ID[] = []
  const projectNameToId = new Map<string, ID>()

  emit(opts, 'workspace')

  if (mode === 'create') {
    workspaceId = newId()
    const workspace: Workspace = {
      id: workspaceId,
      name: plan.workspace.name,
      iconEmoji: plan.workspace.iconEmoji ?? '🏢',
      memberIds: [plan.ownerId],
      adminIds: [plan.ownerId],
      profile: plan.workspace.profile,
      psaMode: plan.workspace.psaMode,
      defaultCurrency: plan.workspace.defaultCurrency ?? 'USD',
      plan: { tier: 'free', seatLimit: 50 },
      createdAt: now(),
    }
    await workspacesStore.add(workspace)

    if (plan.ownerName && plan.ownerEmail) {
      const owner: User = {
        id: plan.ownerId,
        name: plan.ownerName,
        email: plan.ownerEmail,
        avatarColor: colorForUser(plan.ownerId),
        role: 'admin',
        starredProjectIds: [],
        createdAt: now(),
      }
      const existing = useUsersStore.getState().getById(plan.ownerId)
      if (!existing) await useUsersStore.getState().add(owner)
    }
  } else if (workspaceId) {
    await workspacesStore.update(workspaceId, {
      name: plan.workspace.name,
      iconEmoji: plan.workspace.iconEmoji,
      profile: plan.workspace.profile,
      psaMode: plan.workspace.psaMode ?? workspacesStore.getById(workspaceId)?.psaMode,
      defaultCurrency: plan.workspace.defaultCurrency,
    })
  }

  if (!workspaceId) throw new Error('provisionPlan requires workspaceId')

  emit(opts, 'teams')
  const { teams, nameToId: teamNameToId } = await ensureTeams(workspaceId, plan.ownerId, plan.teams)

  emit(opts, 'members')
  if (plan.members?.length) {
    await provisionMembers(workspaceId, plan.ownerId, plan.members, teamNameToId)
  }

  emit(opts, 'fields')
  await ensureRecommendedFields(workspaceId, plan.ownerId)

  if (plan.removeStarterProject) {
    const starter = useProjectsStore
      .getState()
      .list()
      .find((p) => p.workspaceId === workspaceId && p.name === 'Getting Started')
    if (starter) {
      const sectionIds = starter.sectionIds
      for (const sid of sectionIds) await useSectionsStore.getState().remove(sid)
      const tasks = useTasksStore.getState().list().filter((t) => t.projectIds.includes(starter.id))
      for (const task of tasks) await useTasksStore.getState().remove(task.id)
      await useProjectsStore.getState().remove(starter.id)
    }
  }

  emit(opts, 'projects')
  const defaultTeamId = teams[0]?.id
  for (const spec of plan.projects ?? []) {
    if (!spec.templateId || !defaultTeamId) continue
    const teamId = spec.teamName ? teamNameToId.get(spec.teamName) ?? defaultTeamId : defaultTeamId
    const parentId = spec.parentProjectName ? projectNameToId.get(spec.parentProjectName) : undefined
    const result = await instantiateTemplate(spec.templateId, {
      workspaceId,
      teamId,
      ownerId: plan.ownerId,
      name: spec.name,
      defaultView: spec.defaultView,
      privacy: 'public_to_team',
      color: 'primary',
      enabledViews: ['list', 'board', 'calendar', 'timeline', 'gantt'],
      parentProjectId: parentId,
      skipSiblingProjects: spec.skipSiblings,
    })
    if (result?.project) {
      projectIds.push(result.project.id)
      projectNameToId.set(result.project.name, result.project.id)
      for (const sibling of result.siblingProjects ?? []) {
        projectIds.push(sibling.id)
        projectNameToId.set(sibling.name, sibling.id)
      }
      track('template_used', { templateId: spec.templateId, workspaceId, source: 'provision' })
    }
  }

  emit(opts, 'goals')
  const goalIds: ID[] = []
  for (const spec of plan.goals ?? []) {
    const goal: Goal = {
      id: newId(),
      workspaceId,
      name: spec.name,
      description: spec.description,
      ownerId: plan.ownerId,
      timeFrame: { start: now().slice(0, 10), end: now().slice(0, 10) },
      metric: {
        type: 'numeric',
        current: spec.metricCurrent ?? 40,
        target: spec.metricTarget ?? 100,
      },
      status: 'on_track',
      supportingProjectIds: projectIds.slice(0, 3),
      supportingGoalIds: [],
      privacy: 'public',
      createdAt: now(),
    }
    await useGoalsStore.getState().add(goal)
    goalIds.push(goal.id)
  }

  emit(opts, 'portfolios')
  for (const spec of plan.portfolios ?? []) {
    const linked = (spec.projectNames ?? [])
      .map((n) => projectNameToId.get(n))
      .filter((id): id is ID => Boolean(id))
    const portfolio: Portfolio = {
      id: newId(),
      workspaceId,
      name: spec.name,
      description: spec.description,
      ownerId: plan.ownerId,
      projectIds: linked.length ? linked : projectIds.slice(0, 5),
      goalIds: goalIds.slice(0, 2),
      customFieldIds: [],
      status: 'on_track',
      createdAt: now(),
    }
    await usePortfoliosStore.getState().add(portfolio)
  }

  emit(opts, 'psa')
  if (plan.psa) {
    await provisionPsaData(workspaceId, plan.ownerId, plan.psa, opts?.seedRng ?? 42)
  }

  emit(opts, 'inbox')
  if (plan.inboxWelcome) {
    const notification: Notification = {
      id: newId(),
      userId: plan.ownerId,
      type: 'status_update',
      scope: projectIds[0]
        ? { type: 'project', id: projectIds[0] }
        : { type: 'team', id: teams[0]?.id ?? workspaceId },
      message: `${plan.inboxWelcome.title} — ${plan.inboxWelcome.body}`,
      unread: true,
      archived: false,
      createdAt: now(),
    }
    await useNotificationsStore.getState().add(notification)
  }

  emit(opts, 'done')
  track('project_created', { workspaceId, count: projectIds.length, source: 'provision' })

  return { workspaceId, projectIds, teamIds: teams.map((t) => t.id) }
}
