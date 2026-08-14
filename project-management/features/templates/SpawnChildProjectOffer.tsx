'use client'

/** Offer to spawn a child project (PMI / TSA) when trigger task completes. */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { spawnChildProject } from '../../lib/templates/instantiateTemplate'
import type { ProjectWithTemplateMeta, TemplateChildOffer } from '../../lib/templates/types'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useTasksStore } from '../../stores/entities'
import { tasklyticToast } from '../ui/tasklyticToast'

type Props = {
  project: ProjectWithTemplateMeta
  workspaceId: string
}

/** Banner when a template left a pending child-project offer. */
export function SpawnChildProjectOffer({ project, workspaceId }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const offer = project.pendingChildOffer
  const tasks = useTasksStore((s) => s.list())
  const [loading, setLoading] = useState(false)

  const triggerDone = useMemo(() => {
    if (!offer) return false
    return tasks.some(
      (t) =>
        t.projectIds.includes(project.id) &&
        t.name === offer.triggerTaskName &&
        t.completed
    )
  }, [offer, project.id, tasks])

  if (!offer || !triggerDone || !currentUserId) return null

  const spawn = async () => {
    setLoading(true)
    try {
      const name = offer.namePattern.replace('{target}', project.name.replace(/\s—.*$/, '').trim())
      const child = await spawnChildProject(project.id, offer.childTemplateId, name, {
        workspaceId,
        teamId: project.teamId,
        ownerId: currentUserId,
        privacy: project.privacy,
      })
      await useProjectsStore.getState().update(project.id, { pendingChildOffer: undefined } as Partial<ProjectWithTemplateMeta>)
      if (child) {
        tasklyticToast('Child project created', { description: child.name, status: 'success' })
        router.push(`/dashboard/project-management/w/${workspaceId}/projects/${child.id}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{ borderColor: 'hsl(var(--primary-soft))', background: 'hsl(var(--primary-soft))' }}
      role="status"
    >
      <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {offer.toastMessage}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => void useProjectsStore.getState().update(project.id, { pendingChildOffer: undefined } as Partial<ProjectWithTemplateMeta>)}>
          Dismiss
        </Button>
        <Button size="sm" className="tl-btn-primary border-0" disabled={loading} onClick={() => void spawn()}>
          Create project
        </Button>
      </div>
    </div>
  )
}
