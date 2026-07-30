/**
 * Custom field CRUD and task value mutations.
 */
import { emitActivity } from '../activity'
import { newId } from '../ids'
import { now } from '../time'
import type { CustomField, CustomFieldValue, EnumOption, Task } from '../../types'
import {
  useCustomFieldsStore,
  useNotificationsStore,
  useProjectsStore,
  useTasksStore,
} from '../../stores/entities'
import { updateTask } from '../taskActions'
import type { FieldExtras } from './fieldConfig'
import { computeFormula, getTaskFieldValue } from './fieldValues'

export type { FieldExtras }

export type SaveFieldInput = {
  workspaceId: string
  name: string
  type: CustomField['type']
  description?: string
  isGlobal: boolean
  options?: EnumOption[]
  numberFormat?: CustomField['numberFormat']
  currencySymbol?: string
  notify?: boolean
  createdBy: string
} & FieldExtras

function buildField(input: SaveFieldInput, id?: string): CustomField {
  return {
    id: id ?? newId(),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    type: input.type,
    description: input.description,
    isGlobal: input.isGlobal,
    options: input.options,
    numberFormat: input.numberFormat,
    currencySymbol: input.currencySymbol,
    notify: input.notify ?? false,
    createdBy: input.createdBy,
    createdAt: now(),
    ...(input.archived != null ? { archived: input.archived } : {}),
    ...(input.multiline != null ? { multiline: input.multiline } : {}),
    ...(input.required != null ? { required: input.required } : {}),
    ...(input.numberPrecision != null ? { numberPrecision: input.numberPrecision } : {}),
    ...(input.numberMin != null ? { numberMin: input.numberMin } : {}),
    ...(input.numberMax != null ? { numberMax: input.numberMax } : {}),
    ...(input.customLabel != null ? { customLabel: input.customLabel } : {}),
    ...(input.peopleMulti != null ? { peopleMulti: input.peopleMulti } : {}),
    ...(input.includeTime != null ? { includeTime: input.includeTime } : {}),
    ...(input.formulaExpression != null ? { formulaExpression: input.formulaExpression } : {}),
  } as CustomField
}

/** Create a new custom field. */
export async function createField(input: SaveFieldInput): Promise<CustomField> {
  return createCustomField(input)
}

export async function createCustomField(input: SaveFieldInput): Promise<CustomField> {
  const field = buildField(input)
  await useCustomFieldsStore.getState().add(field)
  return field
}

/** Update an existing custom field. */
export async function updateField(id: string, patch: Partial<CustomField> & FieldExtras): Promise<void> {
  return updateCustomField(id, patch)
}

export async function updateCustomField(id: string, patch: Partial<CustomField> & FieldExtras): Promise<void> {
  await useCustomFieldsStore.getState().update(id, patch as Partial<CustomField>)
}

/** Archive a field (hidden from pickers; values kept). */
export async function archiveField(id: string): Promise<void> {
  await updateCustomField(id, { archived: true } as Partial<CustomField>)
}

/** Permanently delete a field and detach from all projects. */
export async function deleteField(id: string): Promise<void> {
  const projects = useProjectsStore.getState().list()
  for (const project of projects) {
    if (project.customFieldIds.includes(id)) {
      await removeFieldFromProject(project.id, id)
    }
  }
  await useCustomFieldsStore.getState().remove(id)
}

export async function addFieldToProject(projectId: string, fieldId: string): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project || project.customFieldIds.includes(fieldId)) return
  await useProjectsStore.getState().update(projectId, {
    customFieldIds: [...project.customFieldIds, fieldId],
    modifiedAt: now(),
  })
}

export async function removeFieldFromProject(projectId: string, fieldId: string): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) return
  await useProjectsStore.getState().update(projectId, {
    customFieldIds: project.customFieldIds.filter((id) => id !== fieldId),
    modifiedAt: now(),
  })
}

/** Reorder custom fields on a project (list columns + detail pane order). */
export async function reorderProjectFields(projectId: string, fieldIds: string[]): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  if (!project) return
  const kept = fieldIds.filter((id) => project.customFieldIds.includes(id))
  const tail = project.customFieldIds.filter((id) => !kept.includes(id))
  await useProjectsStore.getState().update(projectId, {
    customFieldIds: [...kept, ...tail],
    modifiedAt: now(),
  })
}

export { computeFormula, getTaskFieldValue }

/** Set a task custom field value; emits activity and optional notifications. */
export async function setTaskFieldValue(
  task: Task,
  field: CustomField,
  value: CustomFieldValue,
  actorId: string,
  allFields?: CustomField[]
): Promise<void> {
  return setTaskCustomFieldValue(task, field, value, actorId, allFields)
}

export async function setTaskCustomFieldValue(
  task: Task,
  field: CustomField,
  value: CustomFieldValue,
  actorId: string,
  allFields?: CustomField[]
): Promise<void> {
  if (field.type === 'formula') return
  const prev = task.customFieldValues[field.id]
  await updateTask(
    task.id,
    { customFieldValues: { ...task.customFieldValues, [field.id]: value } },
    actorId
  )
  emitActivity({
    taskId: task.id,
    actorId,
    type: 'custom_field_changed',
    details: { fieldId: field.id, fieldName: field.name, value },
  })

  if (field.type === 'dropdown' && field.notify) {
    const prevId = prev?.type === 'dropdown' ? prev.value : undefined
    const nextId = value.type === 'dropdown' ? value.value : undefined
    if (prevId !== nextId && task.collaboratorIds.length) {
      const option = field.options?.find((o) => o.id === nextId)
      const label = option?.label ?? 'cleared'
      const store = useNotificationsStore.getState()
      for (const userId of task.collaboratorIds) {
        if (userId === actorId) continue
        await store.add({
          id: newId(),
          userId,
          actorId,
          type: 'rule_action',
          scope: { type: 'task', id: task.id },
          message: `${field.name} changed to ${label} on "${task.name}"`,
          unread: true,
          archived: false,
          metadata: { notificationKind: 'custom_field_changed', fieldId: field.id, toValue: nextId },
          createdAt: now(),
        })
      }
    }
  }

  void allFields
}

export function countProjectsUsingField(fieldId: string): number {
  return useProjectsStore.getState().list().filter((p) => p.customFieldIds.includes(fieldId)).length
}

export function countTasksUsingField(fieldId: string): number {
  return useTasksStore.getState().list().filter((t) => t.customFieldValues[fieldId] != null).length
}
