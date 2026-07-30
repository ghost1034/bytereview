import { ProjectManagementWorkspaceRouter } from '@/project-management/ProjectManagementWorkspaceRouter'

type Props = {
  params: Promise<{ workspaceId: string; slug?: string[] }>
}

export default async function ProjectManagementWorkspacePage({ params }: Props) {
  const { workspaceId, slug } = await params
  return (
    <ProjectManagementWorkspaceRouter
      workspaceId={workspaceId}
      segments={slug}
    />
  )
}
