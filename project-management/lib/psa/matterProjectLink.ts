import type { Matter, Project } from '../../types'

export type MatterProjectMode = 'create' | 'existing'

export function availableMatterProjects(
  projects: Project[],
  matters: Matter[],
  workspaceId: string,
): Project[] {
  const linkedProjectIds = new Set(matters.map((matter) => matter.projectId))
  return projects.filter((project) => (
    project.workspaceId === workspaceId &&
    !project.archived &&
    !project.matterId &&
    !linkedProjectIds.has(project.id)
  ))
}

export function matchingMatterProjects(projects: Project[], name: string): Project[] {
  const normalizedName = name.trim().toLocaleLowerCase()
  if (!normalizedName) return []
  return projects.filter((project) => project.name.trim().toLocaleLowerCase() === normalizedName)
}

type LinkedProjectSettings = {
  clientId: string
  matterId: string
  ownerId: string
  feeArrangement: Project['feeArrangement']
  rateCardId?: string
  budgetHours?: number
  budgetAmount?: number
  useUtbms: boolean
  trustEnabled: boolean
  modifiedAt: string
}

export function updateForMatterLink(
  project: Project,
  settings: LinkedProjectSettings,
): Project {
  return {
    ...project,
    ...settings,
    requireTimeTracking: true,
  }
}
