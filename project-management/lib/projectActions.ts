/**
 * Project mutations — create, archive, star, sections; emits activity events.
 */
import { emitActivity } from './activity'
import { newId } from './ids'
import { now } from './time'
import { instantiateBusinessTemplate } from './templates/instantiateTemplate'
import type { Project, ProjectStatus, ProjectView, Section, Task } from '../types'
import { useProjectsStore, useSectionsStore, useTasksStore, useUsersStore } from '../stores/entities'

const STARTER_TASKS = ['Kickoff meeting', 'Define success metrics', 'First milestone', 'Document outcomes']

export type CreateProjectInput = {
  workspaceId: string
  teamId: string
  ownerId: string
  name: string
  description?: string
  iconEmoji?: string
  color: string
  privacy: Project['privacy']
  defaultView: ProjectView
  enabledViews: ProjectView[]
  templateId?: string
}

/** Create project with default sections and starter tasks (or from template). */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (input.templateId) {
    const fromTemplate = await instantiateBusinessTemplate(input.templateId, input)
    if (fromTemplate) {
      emitActivity({
        projectId: fromTemplate.id,
        actorId: input.ownerId,
        type: 'status_update_posted',
        details: { action: 'created', projectName: fromTemplate.name, templateId: input.templateId },
      })
      return fromTemplate
    }
  }

  const projectId = newId()
  const sectionNames = ['To do', 'In progress', 'Done']
  const sectionIds = sectionNames.map(() => newId())
  const project: Project = {
    id: projectId,
    workspaceId: input.workspaceId,
    teamId: input.teamId,
    name: input.name,
    description: input.description ? `<p>${input.description}</p>` : undefined,
    iconEmoji: input.iconEmoji ?? '📁',
    color: input.color,
    privacy: input.privacy,
    memberIds: [input.ownerId],
    memberRoles: { [input.ownerId]: 'Project lead' },
    keyResources: [],
    ownerId: input.ownerId,
    defaultView: input.defaultView,
    enabledViews: input.enabledViews,
    status: 'on_track',
    archived: false,
    isTemplate: false,
    customFieldIds: [],
    sectionIds,
    taskOrderBySection: {},
    createdAt: now(),
    modifiedAt: now(),
  }

  const sections: Section[] = sectionNames.map((name, i) => ({
    id: sectionIds[i],
    projectId,
    name,
    order: i,
    collapsed: false,
  }))

  const taskSectionMap = [0, 1, 2, 2]
  const tasks: Task[] = STARTER_TASKS.map((name, index) => {
    const sectionId = sectionIds[taskSectionMap[index]]
    return {
      id: newId(),
      workspaceId: input.workspaceId,
      name,
      resourceSubtype: 'default_task',
      completed: index >= 2,
      completedAt: index >= 2 ? now() : undefined,
      completedById: index >= 2 ? input.ownerId : undefined,
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

  await useProjectsStore.getState().add(project)
  for (const s of sections) await useSectionsStore.getState().add(s)
  for (const t of tasks) await useTasksStore.getState().add(t)

  emitActivity({
    projectId,
    actorId: input.ownerId,
    type: 'status_update_posted',
    details: { action: 'created', projectName: input.name },
  })

  return project
}

/** Archive a project (soft hide from sidebar). */
export async function archiveProject(projectId: string, actorId: string): Promise<void> {
  await useProjectsStore.getState().update(projectId, { archived: true, modifiedAt: now() })
  emitActivity({ projectId, actorId, type: 'status_update_posted', details: { action: 'archived' } })
}

/** Permanently delete a project and its sections/tasks. */
export async function deleteProject(projectId: string, actorId: string): Promise<void> {
  const tasks = useTasksStore.getState().list().filter((t) => t.projectIds.includes(projectId))
  const sections = useSectionsStore.getState().list().filter((s) => s.projectId === projectId)
  for (const t of tasks) await useTasksStore.getState().remove(t.id)
  for (const s of sections) await useSectionsStore.getState().remove(s.id)
  await useProjectsStore.getState().remove(projectId)
  emitActivity({ projectId, actorId, type: 'status_update_posted', details: { action: 'deleted' } })
}

/** Toggle star on a project for the current user. */
export async function toggleStarProject(projectId: string, userId: string, starred: string[]): Promise<void> {
  const next = starred.includes(projectId)
    ? starred.filter((id) => id !== projectId)
    : [...starred, projectId]
  await useUsersStore.getState().update(userId, { starredProjectIds: next })
}

/** Rename a project. */
export async function renameProject(projectId: string, name: string, actorId: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await useProjectsStore.getState().update(projectId, { name: trimmed, modifiedAt: now() })
  emitActivity({ projectId, actorId, type: 'status_update_posted', details: { action: 'renamed', name: trimmed } })
}

/** Update project status pill. */
export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
  actorId: string
): Promise<void> {
  await useProjectsStore.getState().update(projectId, { status, modifiedAt: now() })
  emitActivity({ projectId, actorId, type: 'status_update_posted', details: { action: 'status_changed', status } })
}

/** Duplicate a project (metadata + starter sections/tasks via createProject). */
export async function duplicateProject(projectId: string, actorId: string): Promise<Project> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) throw new Error('Project not found')
  return createProject({
    workspaceId: project.workspaceId,
    teamId: project.teamId,
    ownerId: actorId,
    name: `${project.name} (copy)`,
    description: project.description?.replace(/<[^>]+>/g, ''),
    iconEmoji: project.iconEmoji,
    color: project.color,
    privacy: project.privacy,
    defaultView: project.defaultView,
    enabledViews: project.enabledViews,
  })
}

/** Add a section to a project. */
export async function addProjectSection(projectId: string, name: string): Promise<Section> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) throw new Error('Project not found')
  const section: Section = {
    id: newId(),
    projectId,
    name: name.trim() || 'New section',
    order: project.sectionIds.length,
    collapsed: false,
  }
  await useSectionsStore.getState().add(section)
  await useProjectsStore.getState().update(projectId, {
    sectionIds: [...project.sectionIds, section.id],
    taskOrderBySection: { ...project.taskOrderBySection, [section.id]: [] },
    modifiedAt: now(),
  })
  return section
}

/** Reuse an empty default-named section instead of creating duplicates. */
export async function findOrCreateEmptySection(
  projectId: string,
  defaultName = 'New section'
): Promise<Section> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) throw new Error('Project not found')

  const tasks = useTasksStore.getState().list()
  for (const sectionId of project.sectionIds) {
    const section = useSectionsStore.getState().getById(sectionId)
    if (!section || section.name !== defaultName) continue
    const hasTasks = tasks.some((t) => t.sectionIdByProject[projectId] === sectionId)
    if (!hasTasks) return section
  }

  return addProjectSection(projectId, defaultName)
}

/** Rename a section. */
export async function renameProjectSection(sectionId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await useSectionsStore.getState().update(sectionId, { name: trimmed })
}

/** Delete a section and its tasks in the project. */
export async function deleteProjectSection(sectionId: string): Promise<void> {
  const section = useSectionsStore.getState().getById(sectionId)
  if (!section) return
  const project = useProjectsStore.getState().getById(section.projectId)
  if (!project) return
  const tasks = useTasksStore.getState().list().filter((t) => t.sectionIdByProject[section.projectId] === sectionId)
  for (const t of tasks) await useTasksStore.getState().remove(t.id)
  await useSectionsStore.getState().remove(sectionId)
  const taskOrder = { ...project.taskOrderBySection }
  delete taskOrder[sectionId]
  await useProjectsStore.getState().update(project.id, {
    sectionIds: project.sectionIds.filter((id) => id !== sectionId),
    taskOrderBySection: taskOrder,
    modifiedAt: now(),
  })
}

/** Reorder sections by id list. */
export async function reorderProjectSections(projectId: string, sectionIds: string[]): Promise<void> {
  const updates = sectionIds.map((id, order) =>
    useSectionsStore.getState().update(id, { order })
  )
  await Promise.all(updates)
  await useProjectsStore.getState().update(projectId, { sectionIds, modifiedAt: now() })
}
