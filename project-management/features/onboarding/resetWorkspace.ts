/**
 * Destructive workspace reset — wipes projects/tasks, reprovisions a starter template.
 */
import { provisionPlan } from '../../lib/provisioning'
import {
  useGoalsStore,
  usePortfoliosStore,
  useProjectsStore,
  useSectionsStore,
  useTasksStore,
} from '../../stores/entities'
import type { ID } from '../../types'

/** Remove all projects and related entities in a workspace, then provision one template. */
export async function resetWorkspaceContent(
  workspaceId: ID,
  ownerId: ID,
  workspaceName: string,
  templateId?: ID
): Promise<void> {
  const projects = useProjectsStore.getState().list().filter((p) => p.workspaceId === workspaceId)
  for (const project of projects) {
    const sections = useSectionsStore.getState().list().filter((s) => s.projectId === project.id)
    for (const section of sections) await useSectionsStore.getState().remove(section.id)
    const tasks = useTasksStore.getState().list().filter((t) => t.projectIds.includes(project.id))
    for (const task of tasks) await useTasksStore.getState().remove(task.id)
    await useProjectsStore.getState().remove(project.id)
  }

  const goals = useGoalsStore.getState().list().filter((g) => g.workspaceId === workspaceId)
  for (const goal of goals) await useGoalsStore.getState().remove(goal.id)
  const portfolios = usePortfoliosStore.getState().list().filter((p) => p.workspaceId === workspaceId)
  for (const portfolio of portfolios) await usePortfoliosStore.getState().remove(portfolio.id)

  if (templateId) {
    await provisionPlan({
      mode: 'enrich',
      workspaceId,
      ownerId,
      workspace: { name: workspaceName },
      projects: [{ templateId }],
    })
  }
}
