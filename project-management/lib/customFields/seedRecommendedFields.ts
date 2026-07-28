/**
 * Seed workspace-global recommended custom fields (idempotent).
 */
import { newId } from '../ids'
import { now } from '../time'
import { useCustomFieldsStore, useProjectsStore } from '../../stores/entities'
import type { CustomField, EnumOption } from '../../types'
import { addFieldToProject, createCustomField, updateCustomField } from './customFieldActions'
import { useProjectFieldPrefsStore } from '../../stores/projectFieldPrefs'
import { useTasksStore } from '../../stores/entities'
import { updateTask } from '../taskActions'

const COMPLETION_STATUS_LABELS = new Set(['complete', 'completed', 'done'])

function isCompletionStatusLabel(label: string): boolean {
  return COMPLETION_STATUS_LABELS.has(label.trim().toLowerCase())
}

/** Remove completion-like options from Status — completion uses the list circle instead. */
async function sanitizeStatusFieldOptions(workspaceId: string, actorId: string): Promise<void> {
  const statusFields = useCustomFieldsStore
    .getState()
    .list()
    .filter(
      (f) =>
        f.workspaceId === workspaceId &&
        f.name.toLowerCase() === 'status' &&
        f.type === 'dropdown' &&
        f.options?.some((o) => isCompletionStatusLabel(o.label))
    )

  for (const field of statusFields) {
    const removed = field.options!.filter((o) => isCompletionStatusLabel(o.label))
    const removedIds = new Set(removed.map((o) => o.id))
    const nextOptions = field.options!.filter((o) => !isCompletionStatusLabel(o.label))
    if (!nextOptions.length) continue

    await updateCustomField(field.id, { options: nextOptions })

    const fallback =
      nextOptions.find((o) => o.label.toLowerCase() === 'on track') ?? nextOptions[0]
    for (const task of useTasksStore.getState().list()) {
      const current = task.customFieldValues[field.id]
      if (current?.type === 'dropdown' && current.value && removedIds.has(current.value)) {
        await updateTask(
          task.id,
          {
            customFieldValues: {
              ...task.customFieldValues,
              [field.id]: { type: 'dropdown', value: fallback.id },
            },
          },
          actorId
        )
      }
    }
  }
}

export type RecommendedFieldIds = {
  priorityId: string
  statusId: string
  estimateId?: string
  costId?: string
  effortId?: string
  departmentId?: string
}

export type RecommendedFieldSpec = {
  name: string
  type: CustomField['type']
  description: string
  options?: EnumOption[]
  numberFormat?: CustomField['numberFormat']
  currencySymbol?: string
  customLabel?: string
  notify?: boolean
  showOnCard?: boolean
}

export const RECOMMENDED_FIELD_SPECS: RecommendedFieldSpec[] = [
  {
    name: 'Priority',
    type: 'dropdown',
    description: 'Task priority level',
    notify: true,
    showOnCard: true,
    options: [
      { id: newId(), label: 'Low', color: 'gray' },
      { id: newId(), label: 'Medium', color: 'warning' },
      { id: newId(), label: 'High', color: 'danger' },
    ],
  },
  {
    name: 'Status',
    type: 'dropdown',
    description: 'Task progress status',
    notify: true,
    showOnCard: true,
    options: [
      { id: newId(), label: 'On track', color: 'accent' },
      { id: newId(), label: 'At risk', color: 'warning' },
      { id: newId(), label: 'Off track', color: 'danger' },
    ],
  },
  {
    name: 'Estimate (h)',
    type: 'number',
    description: 'Estimated hours',
    numberFormat: 'plain',
    customLabel: 'h',
  },
  {
    name: 'Cost',
    type: 'number',
    description: 'Estimated cost',
    numberFormat: 'currency',
    currencySymbol: '$',
  },
  {
    name: 'Effort',
    type: 'dropdown',
    description: 'Relative effort',
    options: [
      { id: newId(), label: 'Small', color: 'accent' },
      { id: newId(), label: 'Medium', color: 'warning' },
      { id: newId(), label: 'Large', color: 'danger' },
    ],
  },
  {
    name: 'Department',
    type: 'dropdown',
    description: 'Owning department',
    options: [],
  },
]

function findGlobalField(workspaceId: string, name: string): CustomField | undefined {
  return useCustomFieldsStore
    .getState()
    .list()
    .find((f) => f.workspaceId === workspaceId && f.isGlobal && f.name === name)
}

async function ensureGlobalField(
  workspaceId: string,
  userId: string,
  spec: RecommendedFieldSpec
): Promise<CustomField> {
  const existing = findGlobalField(workspaceId, spec.name)
  if (existing) return existing
  return createCustomField({
    workspaceId,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    isGlobal: true,
    options: spec.options,
    numberFormat: spec.numberFormat,
    currencySymbol: spec.currencySymbol,
    customLabel: spec.customLabel,
    notify: spec.notify ?? false,
    createdBy: userId,
  })
}

/** Ensure Priority and Status (and other recommended fields) exist in the workspace library. */
export async function ensureRecommendedFields(
  workspaceId: string,
  userId: string
): Promise<RecommendedFieldIds> {
  await sanitizeStatusFieldOptions(workspaceId, userId)
  const priority = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[0])
  const status = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[1])
  const estimate = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[2])
  const cost = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[3])
  const effort = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[4])
  const department = await ensureGlobalField(workspaceId, userId, RECOMMENDED_FIELD_SPECS[5])

  const projects = useProjectsStore.getState().list().filter((p) => p.workspaceId === workspaceId)
  const prefs = useProjectFieldPrefsStore.getState()
  const seedPairs: [CustomField, RecommendedFieldSpec][] = [
    [priority, RECOMMENDED_FIELD_SPECS[0]],
    [status, RECOMMENDED_FIELD_SPECS[1]],
  ]

  for (const project of projects) {
    for (const [field, spec] of seedPairs) {
      if (!project.customFieldIds.includes(field.id)) {
        await addFieldToProject(project.id, field.id)
      }
      if (spec.showOnCard) prefs.setShowOnCard(project.id, field.id, true)
    }
  }

  return {
    priorityId: priority.id,
    statusId: status.id,
    estimateId: estimate.id,
    costId: cost.id,
    effortId: effort.id,
    departmentId: department.id,
  }
}

/** Add a recommended field to a project (creates global or local based on isGlobal). */
export async function addRecommendedFieldToProject(
  workspaceId: string,
  userId: string,
  projectId: string,
  spec: RecommendedFieldSpec,
  asGlobal: boolean
): Promise<CustomField> {
  let field: CustomField
  if (asGlobal) {
    field = await ensureGlobalField(workspaceId, userId, spec)
  } else {
    field = await createCustomField({
      workspaceId,
      name: spec.name,
      type: spec.type,
      description: spec.description,
      isGlobal: false,
      options: spec.options?.map((o) => ({ ...o, id: newId() })),
      numberFormat: spec.numberFormat,
      currencySymbol: spec.currencySymbol,
      customLabel: spec.customLabel,
      notify: spec.notify ?? false,
      createdBy: userId,
    })
  }
  await addFieldToProject(projectId, field.id)
  if (spec.showOnCard) {
    useProjectFieldPrefsStore.getState().setShowOnCard(projectId, field.id, true)
  }
  return field
}

export { seedRecommendedFields as seedRecommendedFieldsAlias }

/** @deprecated alias — use ensureRecommendedFields */
export const seedRecommendedFields = ensureRecommendedFields
