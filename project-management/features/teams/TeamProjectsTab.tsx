'use client'

/** Team projects tab — grid of project cards. */
import { ProjectCard } from '../projects/ProjectCard'
import type { Team } from '../../types'
import { useProjectsStore } from '../../stores/entities'

type Props = {
  team: Team
  workspaceId: string
}

export function TeamProjectsTab({ team, workspaceId }: Props) {
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.teamId === team.id && p.workspaceId === workspaceId && !p.archived)
  )

  if (projects.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        No projects in this team yet. Projects from step 06 will appear here.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          href={`/dashboard/project-management/w/${workspaceId}/projects/${project.id}`}
        />
      ))}
    </div>
  )
}
