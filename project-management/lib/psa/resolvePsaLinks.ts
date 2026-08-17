import type { ID, Matter, Project } from '../../types'

/** Resolve the engagement linked to a project, while honoring an explicit selection. */
export function resolveLinkedMatter(
  matters: Matter[],
  project?: Project,
  matterId?: ID,
): Matter | undefined {
  if (matterId) return matters.find((matter) => matter.id === matterId)

  const projectMatterId = project?.matterId
  if (projectMatterId) {
    const linkedById = matters.find((matter) => matter.id === projectMatterId)
    if (linkedById) return linkedById
  }

  return project
    ? matters.find((matter) => matter.projectId === project.id)
    : undefined
}
