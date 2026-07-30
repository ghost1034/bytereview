/**
 * Starter workspace provisioning for first-time Tasklytic users.
 * Delegates to the unified provisioning engine while preserving the legacy bundle shape.
 */
import { colorForUser } from './colors'
import { newId } from './ids'
import { now } from './time'
import { provisionPlan } from './provisioning'
import { teamsForIndustry } from './provisioning/industryTeams'
import type { Goal, Notification, Portfolio, Project, Section, Task, Team, User, Workspace } from '../types'

export type ProvisionInput = {
  userId: string
  userName: string
  userEmail: string
  companyName?: string
  industry?: string
}

export type ProvisionResult = {
  workspace: Workspace
  team: Team
  project: Project
  sections: Section[]
  tasks: Task[]
  user: User
  notification: Notification
  goal: Goal
  portfolio: Portfolio
}

const STARTER_TASK_NAMES = [
  'Kickoff meeting',
  'Define success metrics',
  'First milestone',
  'Document outcomes',
]

/** Build starter workspace content for a new tenant (minimal — onboarding enriches). */
export function buildStarterContent(input: ProvisionInput): ProvisionResult {
  const workspaceId = newId()
  const teamId = newId()
  const projectId = newId()
  const sectionIds = [newId(), newId(), newId()]
  const sectionNames = ['To do', 'In progress', 'Done']

  const user: User = {
    id: input.userId,
    name: input.userName,
    email: input.userEmail,
    avatarColor: colorForUser(input.userId),
    role: 'admin',
    starredProjectIds: [],
    createdAt: now(),
  }

  const workspace: Workspace = {
    id: workspaceId,
    name: input.companyName ?? `${input.userName.split(' ')[0] ?? 'My'}'s Workspace`,
    iconEmoji: '🏢',
    memberIds: [input.userId],
    adminIds: [input.userId],
    profile: input.industry ? { industry: input.industry, signedUpAt: now() } : { signedUpAt: now() },
    plan: { tier: 'free', seatLimit: 10 },
    createdAt: now(),
  }

  const industryTeams = teamsForIndustry(input.industry)
  const primaryTeamName = industryTeams[0]?.name ?? 'General'
  const team: Team = {
    id: teamId,
    workspaceId,
    name: primaryTeamName,
    iconEmoji: industryTeams[0]?.iconEmoji ?? '👥',
    memberIds: [input.userId],
    adminIds: [input.userId],
    privacy: 'public',
  }

  const project: Project = {
    id: projectId,
    workspaceId,
    teamId,
    name: 'Getting Started',
    description: '<p>Welcome to the CPAAutomation AI Productivity Suite — your home for projects and tasks.</p>',
    iconEmoji: '🚀',
    color: 'primary',
    privacy: 'public_to_team',
    memberIds: [input.userId],
    ownerId: input.userId,
    defaultView: 'list',
    enabledViews: ['list', 'board', 'calendar', 'timeline', 'gantt'],
    status: 'on_track',
    archived: false,
    isTemplate: false,
    customFieldIds: [],
    sectionIds,
    taskOrderBySection: {},
    createdAt: now(),
    modifiedAt: now(),
  }

  const sections: Section[] = sectionNames.map((name, index) => ({
    id: sectionIds[index],
    projectId,
    name,
    order: index,
    collapsed: false,
  }))

  const taskSectionMap = [0, 1, 2, 2]
  const tasks: Task[] = STARTER_TASK_NAMES.map((name, index) => {
    const sectionId = sectionIds[taskSectionMap[index]]
    return {
      id: newId(),
      workspaceId,
      name,
      resourceSubtype: 'default_task',
      completed: index >= 2,
      completedAt: index >= 2 ? now() : undefined,
      completedById: index >= 2 ? input.userId : undefined,
      collaboratorIds: [],
      projectIds: [projectId],
      sectionIdByProject: { [projectId]: sectionId },
      tagIds: [],
      customFieldValues: {},
      dependencyIds: [],
      dependentIds: [],
      attachmentIds: [],
      likedByIds: [],
      createdAt: now(),
      modifiedAt: now(),
    }
  })

  project.taskOrderBySection = {
    [sectionIds[0]]: [tasks[0].id],
    [sectionIds[1]]: [tasks[1].id],
    [sectionIds[2]]: [tasks[2].id, tasks[3].id],
  }

  const notification: Notification = {
    id: newId(),
    userId: input.userId,
    type: 'status_update',
    scope: { type: 'project', id: projectId },
    message: 'Welcome to the AI Productivity Suite — open your starter project to begin.',
    unread: true,
    archived: false,
    createdAt: now(),
  }

  const quarterStart = new Date()
  quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1)
  const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0)

  const goal: Goal = {
    id: newId(),
    workspaceId,
    name: 'Launch the AI Productivity Suite successfully',
    description: 'Complete onboarding and ship the first milestone.',
    ownerId: input.userId,
    timeFrame: {
      start: quarterStart.toISOString().slice(0, 10),
      end: quarterEnd.toISOString().slice(0, 10),
    },
    metric: { type: 'percent', current: 50, target: 100 },
    status: 'on_track',
    supportingProjectIds: [projectId],
    supportingGoalIds: [],
    privacy: 'public',
    createdAt: now(),
  }

  const portfolio: Portfolio = {
    id: newId(),
    workspaceId,
    name: 'Product launch',
    description: 'Track progress across launch initiatives.',
    ownerId: input.userId,
    projectIds: [projectId],
    goalIds: [goal.id],
    customFieldIds: [],
    status: 'on_track',
    createdAt: now(),
  }

  return { workspace, team, project, sections, tasks, user, notification, goal, portfolio }
}

/** Async enrich via provisioning engine (onboarding finish, trial, evaluation). */
export async function enrichWorkspaceFromPlan(
  ...args: Parameters<typeof provisionPlan>
): ReturnType<typeof provisionPlan> {
  return provisionPlan(...args)
}

export { provisionPlan } from './provisioning'
