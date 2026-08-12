/**
 * Instantiate curated ProjectTemplate → Project + sections + tasks + fields + rules + forms + dashboards.
 */
import { emitActivity } from '../activity'
import { addFieldToProject, createCustomField } from '../customFields/customFieldActions'
import { ensureRecommendedFields } from '../customFields/seedRecommendedFields'
import { newId } from '../ids'
import { now } from '../time'
import type { CustomField, Form, ProjectView, Rule, Section } from '../../types'
import {
  useCustomFieldsStore,
  useDashboardsStore,
  useFormsStore,
  useProjectsStore,
  useRulesStore,
  useSectionsStore,
} from '../../stores/entities'
import type { CreateProjectInput } from '../projectActions'
import { createTaskFromTaskTemplate } from './instantiateTasks'
import { getCuratedTemplateById } from './templateLibrary'
import type {
  CuratedProjectTemplate,
  InstantiateTemplateInput,
  InstantiateTemplateResult,
  ProjectWithTemplateMeta,
  TemplateFieldSpec,
} from './types'

const PROJECT_VIEWS: ProjectView[] = ['list', 'board', 'calendar', 'timeline', 'gantt']

async function resolveFieldSpec(
  workspaceId: string,
  userId: string,
  spec: TemplateFieldSpec
): Promise<CustomField> {
  if (spec.reuseGlobalName) {
    const global = useCustomFieldsStore
      .getState()
      .list()
      .find((f) => f.workspaceId === workspaceId && f.isGlobal && f.name === spec.reuseGlobalName)
    if (global) return global
    await ensureRecommendedFields(workspaceId, userId)
    const again = useCustomFieldsStore
      .getState()
      .list()
      .find((f) => f.workspaceId === workspaceId && f.isGlobal && f.name === spec.reuseGlobalName)
    if (again) return again
  }
  return createCustomField({
    workspaceId,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    isGlobal: spec.isGlobal ?? false,
    options: spec.options?.map((o) => ({ id: newId(), label: o.label, color: o.color })),
    numberFormat: spec.numberFormat,
    currencySymbol: spec.currencySymbol,
    createdBy: userId,
  })
}

async function instantiateOneTemplate(
  template: CuratedProjectTemplate,
  input: InstantiateTemplateInput
): Promise<InstantiateTemplateResult> {
  const projectStart = input.startOn ?? new Date().toISOString().slice(0, 10)
  const projectId = newId()
  const sectionIds = template.sectionNames.map(() => newId())
  const projectName = input.name ?? template.name

  const project: ProjectWithTemplateMeta = {
    id: projectId,
    workspaceId: input.workspaceId,
    teamId: input.teamId,
    name: projectName,
    description: input.description ?? (template.description ? `<p>${template.description}</p>` : undefined),
    iconEmoji: input.iconEmoji ?? template.iconEmoji ?? '📁',
    color: input.color ?? template.color ?? 'primary',
    privacy: input.privacy,
    memberIds: [input.ownerId],
    ownerId: input.ownerId,
    defaultView: input.defaultView ?? template.defaultView ?? 'list',
    enabledViews: input.enabledViews ?? template.enabledViews ?? PROJECT_VIEWS,
    status: 'on_track',
    startOn: projectStart,
    archived: false,
    isTemplate: false,
    customFieldIds: [],
    sectionIds,
    taskOrderBySection: {},
    createdAt: now(),
    modifiedAt: now(),
    templateId: template.id,
    parentProjectId: input.parentProjectId,
    sourceTemplateName: template.name,
    pendingChildOffer: template.childProjectOffer,
  }

  const sections: Section[] = template.sectionNames.map((name, i) => ({
    id: sectionIds[i],
    projectId,
    name,
    order: i,
    collapsed: false,
  }))

  for (const spec of template.recommendedFields ?? []) {
    const field = await resolveFieldSpec(input.workspaceId, input.ownerId, spec)
    if (!project.customFieldIds.includes(field.id)) project.customFieldIds.push(field.id)
  }
  for (const fieldId of template.customFieldIds) {
    if (!project.customFieldIds.includes(fieldId)) project.customFieldIds.push(fieldId)
  }

  const taskOrderBySection: Record<string, string[]> = {}
  sectionIds.forEach((id) => {
    taskOrderBySection[id] = []
  })

  // Persist parents first because the backend validates every task's project
  // and section references before accepting the task record.
  await useProjectsStore.getState().add(project)
  for (const section of sections) {
    await useSectionsStore.getState().add(section)
  }

  for (let i = 0; i < template.taskTemplates.length; i++) {
    const spec = template.taskSpecs?.[i]
    const sectionIndex = spec?.sectionIndex ?? 0
    const sectionId = sectionIds[sectionIndex] ?? sectionIds[0]
    await createTaskFromTaskTemplate(template.taskTemplates[i], {
      workspaceId: input.workspaceId,
      projectId,
      sectionId,
      ownerId: input.ownerId,
      projectStart,
      taskOrder: taskOrderBySection[sectionId],
      roleAssignments: input.roleAssignments,
    })
  }

  project.taskOrderBySection = taskOrderBySection

  await useProjectsStore.getState().update(projectId, { taskOrderBySection })
  for (const fieldId of project.customFieldIds) await addFieldToProject(projectId, fieldId)

  await createRulesFormsDashboards(template, projectId, input, sections, project.customFieldIds)

  emitActivity({
    projectId,
    actorId: input.ownerId,
    type: 'status_update_posted',
    details: { action: 'created_from_template', templateName: template.name, templateId: template.id },
  })

  const siblingProjects: ProjectWithTemplateMeta[] = []
  if (!input.skipSiblingProjects && template.siblingProjects?.length) {
    for (const sibling of template.siblingProjects) {
      const siblingTpl = getCuratedTemplateById(sibling.templateId)
      if (!siblingTpl) continue
      const result = await instantiateOneTemplate(siblingTpl, {
        ...input,
        name: `${projectName}${sibling.suffix}`,
        parentProjectId: sibling.linkAs === 'child' ? projectId : input.parentProjectId,
        skipSiblingProjects: true,
      })
      siblingProjects.push(result.project)
    }
  }

  return { project, siblingProjects, childOffer: template.childProjectOffer }
}

async function createRulesFormsDashboards(
  template: CuratedProjectTemplate,
  projectId: string,
  input: InstantiateTemplateInput,
  sections: Section[],
  customFieldIds: string[],
): Promise<void> {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const fields = useCustomFieldsStore.getState().list().filter((field) => customFieldIds.includes(field.id))
  const resolveFieldId = (value: string) => fields.find((field) => field.id === value || normalize(field.name) === normalize(value))?.id ?? value
  const resolveSectionId = (value: string) => sections.find((section) => section.id === value || normalize(section.name) === normalize(value))?.id ?? value
  for (const ruleTpl of template.ruleTemplates ?? []) {
    const trigger = ruleTpl.trigger.type === 'custom_field_changed'
      ? { ...ruleTpl.trigger, customFieldId: resolveFieldId(ruleTpl.trigger.customFieldId) }
      : ruleTpl.trigger
    const actions = ruleTpl.actions.map((action) => {
      if (action.type === 'assign_to' || action.type === 'send_notification') return { ...action, userId: action.userId === 'owner' ? input.ownerId : (input.roleAssignments?.[action.userId] ?? action.userId) }
      if (action.type === 'move_to_section') return { ...action, sectionId: resolveSectionId(action.sectionId) }
      if (action.type === 'set_custom_field') return { ...action, customFieldId: resolveFieldId(action.customFieldId) }
      return action
    })
    const rule: Rule = { ...ruleTpl, trigger, actions, id: newId(), projectId, createdBy: input.ownerId, createdAt: now() }
    await useRulesStore.getState().add(rule)
  }
  for (const formTpl of template.formTemplates ?? []) {
    const form: Form = { ...formTpl, id: newId(), projectId, createdAt: now() }
    await useFormsStore.getState().add(form)
  }
  for (const dashTpl of template.dashboardTemplates ?? []) {
    await useDashboardsStore.getState().add({
      ...dashTpl,
      id: newId(),
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      charts: dashTpl.charts.map((c) => ({ ...c, id: newId() })),
      sharedWith: [],
      createdAt: now(),
    })
  }
}

/** Instantiate a curated template by id. */
export async function instantiateTemplate(
  templateId: string,
  input: InstantiateTemplateInput
): Promise<InstantiateTemplateResult | null> {
  const template = getCuratedTemplateById(templateId)
  if (!template) return null
  return instantiateOneTemplate(template, input)
}

/** @deprecated alias — use instantiateTemplate */
export async function instantiateBusinessTemplate(
  templateId: string,
  input: Omit<CreateProjectInput, 'name'> & { name?: string; startOn?: string; parentProjectId?: string }
): Promise<ProjectWithTemplateMeta | null> {
  const result = await instantiateTemplate(templateId, {
    workspaceId: input.workspaceId,
    teamId: input.teamId,
    ownerId: input.ownerId,
    name: input.name,
    description: input.description ? `<p>${input.description}</p>` : undefined,
    iconEmoji: input.iconEmoji,
    color: input.color,
    privacy: input.privacy,
    defaultView: input.defaultView,
    enabledViews: input.enabledViews,
    startOn: input.startOn,
    parentProjectId: input.parentProjectId,
  })
  return result?.project ?? null
}

/** Spawn a child project from PMI / TSA offer. */
export async function spawnChildProject(
  parentProjectId: string,
  childTemplateId: string,
  name: string,
  input: Omit<InstantiateTemplateInput, 'parentProjectId' | 'name'>
): Promise<ProjectWithTemplateMeta | null> {
  const result = await instantiateTemplate(childTemplateId, {
    ...input,
    name,
    parentProjectId,
    skipSiblingProjects: true,
  })
  if (result?.project) {
    await useProjectsStore.getState().update(parentProjectId, {
      modifiedAt: now(),
    } as Partial<ProjectWithTemplateMeta>)
  }
  return result?.project ?? null
}

export { getCuratedTemplateById, TEMPLATE_LIBRARY, TEMPLATE_CATEGORIES } from './templateLibrary'
