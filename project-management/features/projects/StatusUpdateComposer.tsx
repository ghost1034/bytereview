'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Project } from '../../types'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { isStatusUpdateDue, latestStatusUpdate } from '../status/summaries'
import { StatusHistory } from '../status/StatusHistory'
import { StatusUpdateCard } from '../status/StatusUpdateCard'
import { StatusUpdateDialog } from '../status/StatusUpdateDialog'
import { ProjectStatusPill } from './ProjectStatusPill'

type Props = {
  project: Project
  currentUserId: string
}

/** Overview status section — pill, due indicator, latest update, and composer entry. */
export function StatusUpdateComposer({ project, currentUserId }: Props) {
  const users = useUsersStore((s) => s.list())
  const latest = useStatusUpdatesStore((s) => {
    const rows = s
      .list()
      .filter((u) => u.scope.type === 'project' && u.scope.id === project.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return rows[0]
  })
  const statusDue = useMemo(
    () => isStatusUpdateDue({ type: 'project', id: project.id }),
    [project.id, latest?.createdAt]
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('updates') === '1' || searchParams.get('update')) {
      setHistoryOpen(true)
    }
  }, [searchParams])

  const author = latest ? users.find((u) => u.id === latest.authorId) : undefined

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusPill status={project.status} />
          {statusDue ? (
            <Badge variant="outline" className="gap-1 text-xs" style={{ color: 'hsl(var(--warning))', borderColor: 'hsl(var(--warning))' }}>
              <AlertCircle className="h-3 w-3" /> Status due
            </Badge>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          Update status
        </Button>
      </div>

      {!latest ? (
        <p className="mt-3 text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
          What&apos;s the status? Share an update with your team.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Latest update
          </p>
          <StatusUpdateCard update={latest} author={author} compact />
          <button
            type="button"
            className="text-xs underline"
            style={{ color: 'hsl(var(--primary))' }}
            onClick={() => setHistoryOpen(true)}
          >
            View all updates
          </button>
        </div>
      )}

      <StatusUpdateDialog
        project={project}
        currentUserId={currentUserId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <StatusHistory project={project} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
