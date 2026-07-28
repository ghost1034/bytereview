'use client'

/** Resolve custom fields attached to a project or workspace library. */
import { useEffect, useMemo } from 'react'
import { syncCustomFieldColumns } from '../../stores/columns'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useProjectsStore } from '../../stores/entities'
import type { CustomField, Project } from '../../types'
import { useProjectFieldPrefsStore } from '../../stores/projectFieldPrefs'

export function getWorkspaceFields(workspaceId: string): CustomField[] {
  return useCustomFieldsStore
    .getState()
    .list()
    .filter((f) => f.workspaceId === workspaceId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getProjectFields(project: Project): CustomField[] {
  const all = useCustomFieldsStore.getState().items
  return project.customFieldIds
    .map((id) => all[id])
    .filter((f): f is CustomField => Boolean(f))
}

export function findFieldByName(workspaceId: string, name: string): CustomField | undefined {
  return getWorkspaceFields(workspaceId).find((f) => f.name === name)
}

function resolveProject(projectOrId: Project | string | undefined): Project | undefined {
  if (!projectOrId) return undefined
  if (typeof projectOrId === 'string') {
    return useProjectsStore.getState().getById(projectOrId)
  }
  return projectOrId
}

/** Hook returning resolved custom fields for a project (by id or Project). */
export function useProjectFields(projectOrId: Project | string | undefined) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const customFields = useCustomFieldsStore((s) => s.list())
  const projects = useProjectsStore((s) => s.items)
  const project = useMemo(() => {
    if (!projectOrId) return undefined
    if (typeof projectOrId === 'string') return projects[projectOrId]
    return projectOrId
  }, [projectOrId, projects])

  const getShowOnCard = useProjectFieldPrefsStore((s) => s.getShowOnCard)

  const fields = useMemo(() => {
    if (!project) return []
    const map = new Map(customFields.map((f) => [f.id, f]))
    return project.customFieldIds.map((id) => map.get(id)).filter((f): f is CustomField => Boolean(f))
  }, [customFields, project])

  const workspaceLibrary = useMemo(() => {
    if (!project) return []
    return customFields
      .filter((f) => f.workspaceId === project.workspaceId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customFields, project])

  const customFieldIdsKey = project?.customFieldIds.join(',') ?? ''

  useEffect(() => {
    if (!project) return
    syncCustomFieldColumns(currentUserId, project.id, fields)
  }, [currentUserId, customFieldIdsKey, fields, project])

  const cardFields = useMemo(
    () => fields.filter((f) => getShowOnCard(project?.id ?? '', f.id)).slice(0, 4),
    [fields, getShowOnCard, project?.id]
  )

  return { fields, workspaceLibrary, cardFields, project }
}

export function useTaskProjectFields(taskProjectIds: string[]) {
  const projects = useProjectsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())

  return useMemo(() => {
    const seen = new Set<string>()
    const result: CustomField[] = []
    taskProjectIds.forEach((pid) => {
      const project = projects.find((p) => p.id === pid)
      if (!project) return
      project.customFieldIds.forEach((fid) => {
        if (seen.has(fid)) return
        const field = customFields.find((f) => f.id === fid)
        if (field) {
          seen.add(fid)
          result.push(field)
        }
      })
    })
    return result
  }, [customFields, projects, taskProjectIds])
}

export { resolveProject }
