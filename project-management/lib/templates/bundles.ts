/**
 * Bundle apply logic — merge fields, sections, rules, and tasks into a project.
 */
import { newId } from '../ids'
import { now } from '../time'
import { addFieldToProject } from '../customFields/customFieldActions'
import { addProjectSection } from '../projectActions'
import type { Rule } from '../../types'
import { useProjectsStore, useRulesStore, useTasksStore } from '../../stores/entities'
import type { Bundle } from './types'
import { instantiateTemplateTasksFromTemplates } from './instantiateTasks'

/** Apply a bundle to an existing project (append-only merge). */
export async function applyBundle(
  bundle: Bundle,
  projectId: string,
  workspaceId: string,
  actorId: string
): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) return

  for (const fieldId of bundle.customFieldIds) {
    await addFieldToProject(projectId, fieldId)
  }

  for (const sectionName of bundle.sectionNames) {
    await addProjectSection(projectId, sectionName)
  }

  const updated = useProjectsStore.getState().getById(projectId)
  if (!updated) return
  const lastSectionId = updated.sectionIds[updated.sectionIds.length - 1]

  if (lastSectionId) {
    await instantiateTemplateTasksFromTemplates(bundle.taskTemplates, {
      workspaceId,
      projectId,
      sectionId: lastSectionId,
      ownerId: actorId,
      projectStart: updated.startOn ?? new Date().toISOString().slice(0, 10),
    })
  }

  for (const ruleTpl of bundle.ruleTemplates) {
    const rule: Rule = { ...ruleTpl, id: newId(), projectId, createdBy: actorId, createdAt: now() }
    await useRulesStore.getState().add(rule)
  }

  if (!bundle.appliedToProjectIds.includes(projectId)) {
    bundle.appliedToProjectIds.push(projectId)
  }
}

/** Create a new bundle record (persist via caller / store wrapper). */
export function createBundleRecord(
  partial: Omit<Bundle, 'id' | 'createdAt' | 'appliedToProjectIds'>
): Bundle {
  return {
    ...partial,
    id: newId(),
    appliedToProjectIds: [],
    createdAt: now(),
  }
}
