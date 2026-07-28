/**
 * Workspace lifecycle actions — delete with cascading cleanup.
 */
import {
  useProjectsStore,
  useTeamsStore,
  useWorkspacesStore,
  useWorkspaceInvitationsStore,
} from '../../stores/entities'
import { useUiStore } from '../../stores/auth'

/** Delete workspace and related workspace-scoped teams/projects. */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const teams = useTeamsStore.getState().list().filter((t) => t.workspaceId === workspaceId)
  for (const team of teams) {
    await useTeamsStore.getState().remove(team.id)
  }
  const projects = useProjectsStore.getState().list().filter((p) => p.workspaceId === workspaceId)
  for (const project of projects) {
    await useProjectsStore.getState().remove(project.id)
  }
  const invites = useWorkspaceInvitationsStore.getState().list().filter((i) => i.workspaceId === workspaceId)
  for (const inv of invites) {
    await useWorkspaceInvitationsStore.getState().remove(inv.id)
  }
  await useWorkspacesStore.getState().remove(workspaceId)

  const active = useUiStore.getState().activeWorkspaceId
  if (active === workspaceId) {
    const remaining = useWorkspacesStore.getState().list()[0]
    useUiStore.getState().setActiveWorkspaceId(remaining?.id ?? null)
  }
}
