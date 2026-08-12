/**
 * Save project or task subtree as reusable templates (workspace-level).
 */
import { newId } from '../ids'
import type { ProjectTemplate, Task, TaskTemplate } from '../../types'
import {
  useProjectsStore,
  useRulesStore,
  useSectionsStore,
  useTasksStore,
  useTemplatesStore,
} from '../../stores/entities'
import type { SaveProjectAsTemplateInput } from './types'

function taskToTemplate(task: Task, allTasks: Task[]): TaskTemplate {
  const children = allTasks.filter((t) => t.parentId === task.id)
  return {
    id: newId(),
    name: task.name,
    defaults: {
      notes: task.notes,
      resourceSubtype: task.resourceSubtype,
      effort: task.effort,
    },
    subtaskTemplates: children.map((c) => taskToTemplate(c, allTasks)),
  }
}

/** Capture a project as a ProjectTemplate in the workspace templates store. */
export async function saveProjectAsTemplate(input: SaveProjectAsTemplateInput): Promise<ProjectTemplate> {
  const project = useProjectsStore.getState().getById(input.projectId)
  if (!project) throw new Error('Project not found')

  const sections = useSectionsStore
    .getState()
    .list()
    .filter((s) => s.projectId === input.projectId)
    .sort((a, b) => a.order - b.order)

  const allTasks = useTasksStore.getState().list().filter((t) => t.projectIds.includes(input.projectId))
  const rootTasks = allTasks.filter((t) => !t.parentId)

  const sectionIndexById = new Map(sections.map((s, i) => [s.id, i]))
  const taskTemplates: TaskTemplate[] = input.includeTasks
    ? rootTasks
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => {
          const sectionId = t.sectionIdByProject[input.projectId]
          const tpl = taskToTemplate(t, allTasks)
          const idx = sectionId ? sectionIndexById.get(sectionId) ?? 0 : 0
          tpl.defaults = { ...tpl.defaults, notes: `${tpl.defaults.notes ?? ''}\nsectionIndex:${idx}`.trim() }
          return tpl
        })
    : []

  let customFieldIds: string[] = []
  if (input.includeCustomFields) customFieldIds = [...project.customFieldIds]

  const template: ProjectTemplate = {
    id: newId(),
    name: input.name,
    description: input.description,
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    iconEmoji: input.iconEmoji ?? project.iconEmoji ?? '📋',
    defaults: {
      iconEmoji: input.iconEmoji ?? project.iconEmoji,
      color: project.color,
      defaultView: project.defaultView,
      enabledViews: project.enabledViews,
      description: project.description,
    },
    sectionNames: sections.map((s) => s.name),
    taskTemplates,
    customFieldIds,
    ruleTemplates: input.includeRules
      ? useRulesStore.getState().list().filter((rule) => rule.projectId === input.projectId).map(({ id: _id, projectId: _projectId, createdBy: _createdBy, createdAt: _createdAt, ...rule }) => rule)
      : [],
  }

  await useTemplatesStore.getState().add(template)

  return template
}

/** Save a single task subtree as a named TaskTemplate (stored as mini ProjectTemplate). */
export async function saveTaskAsTemplate(
  taskId: string,
  workspaceId: string,
  name: string,
  createdBy: string
): Promise<ProjectTemplate> {
  const task = useTasksStore.getState().getById(taskId)
  if (!task) throw new Error('Task not found')
  const allTasks = useTasksStore.getState().list().filter((t) => t.projectIds.some((pid) => task.projectIds.includes(pid)))
  const template: ProjectTemplate = {
    id: newId(),
    name,
    description: `Task template from "${task.name}"`,
    workspaceId,
    createdBy,
    iconEmoji: '📋',
    defaults: { iconEmoji: '📋' },
    sectionNames: ['Tasks'],
    taskTemplates: [taskToTemplate(task, allTasks)],
    customFieldIds: [],
  }
  await useTemplatesStore.getState().add(template)
  return template
}

/** List saved workspace templates. */
export function listSavedTemplates(workspaceId: string): ProjectTemplate[] {
  return useTemplatesStore.getState().list().filter((template) => !template.workspaceId || template.workspaceId === workspaceId)
}

/** Delete a saved workspace template. */
export async function deleteSavedTemplate(templateId: string): Promise<void> {
  await useTemplatesStore.getState().remove(templateId)
}
