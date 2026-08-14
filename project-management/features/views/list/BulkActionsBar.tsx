'use client'

/**
 * BulkActionsBar — floating bar for multi-selected task actions.
 */
import { useState } from 'react'
import { addDays, startOfToday } from 'date-fns'
import { CalendarIcon, Check, FolderInput, FolderPlus, Trash2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { TasklyticPopoverContent } from '../../ui/TasklyticPopoverContent'
import { Calendar } from '@/components/ui/calendar'
import {
  assign,
  deleteTask,
  addToProject,
  setDue,
  setSectionForProject,
  updateTask,
} from '../../../lib/taskActions'
import { toISODate, now } from '../../../lib/time'
import { useAuthStore } from '../../../stores/auth'
import { useProjectsStore, useSectionsStore, useTasksStore, useUsersStore } from '../../../stores/entities'
import { pushTaskUndo } from '../../../stores/taskUndo'
import { UserAvatar } from '../../profile/UserAvatar'

type Props = {
  selected: Set<string>
  workspaceId: string
  currentProjectId: string
  onClear: () => void
}

/** Bottom floating bar when one or more tasks are selected. */
export function BulkActionsBar({ selected, workspaceId, currentProjectId, onClear }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === currentProjectId).sort((a, b) => a.order - b.order)
  )
  const ids = [...selected]
  const [assignOpen, setAssignOpen] = useState(false)
  const [dueOpen, setDueOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [sectionOpen, setSectionOpen] = useState(false)

  if (!ids.length) return null

  const runAll = async (fn: (id: string) => Promise<void>) => {
    if (!currentUserId) return
    await Promise.all(ids.map((id) => fn(id)))
  }

  const bulkComplete = async () => {
    if (!currentUserId) return
    const before = ids
      .map((id) => {
        const task = useTasksStore.getState().getById(id)
        if (!task) return null
        return {
          id,
          completed: task.completed,
          completedAt: task.completedAt,
          completedById: task.completedById,
        }
      })
      .filter(Boolean) as Array<{
      id: string
      completed: boolean
      completedAt?: string
      completedById?: string
    }>
    await Promise.all(
      ids.map((id) =>
        updateTask(
          id,
          { completed: true, completedAt: now(), completedById: currentUserId },
          currentUserId
        )
      )
    )
    if (before.length) {
      pushTaskUndo(
        {
          label: `Marked ${before.length} tasks complete`,
          revert: async () => {
            await Promise.all(
              before.map((row) =>
                updateTask(
                  row.id,
                  {
                    completed: row.completed,
                    completedAt: row.completedAt,
                    completedById: row.completedById,
                  },
                  currentUserId
                )
              )
            )
          },
        },
        {
          title: `${before.length} tasks marked complete`,
          description: 'Use Show completed in the toolbar if rows are hidden.',
        }
      )
    }
    onClear()
  }

  const bulkDelete = async () => {
    if (!currentUserId) return
    const snapshots = ids
      .map((id) => useTasksStore.getState().getById(id))
      .filter(Boolean)
      .map((task) => ({ ...task! }))
    await Promise.all(ids.map((id) => deleteTask(id, currentUserId, { skipUndo: true })))
    if (snapshots.length) {
      pushTaskUndo(
        {
          label: `Deleted ${snapshots.length} tasks`,
          revert: async () => {
            for (const snapshot of snapshots) {
              await useTasksStore.getState().add(snapshot)
            }
          },
        },
        {
          title: `${snapshots.length} tasks deleted`,
          description: 'Use Undo in the toolbar to restore these tasks (up to 10 recent actions).',
        }
      )
    }
    onClear()
  }

  const bulkAssign = (userId: string | undefined) =>
    runAll((id) => assign(id, userId, currentUserId!)).then(() => {
      setAssignOpen(false)
      onClear()
    })

  const bulkDue = (dueOn: string | null) =>
    runAll((id) => setDue(id, { dueOn }, currentUserId!)).then(() => {
      setDueOpen(false)
      onClear()
    })

  const bulkAddProject = (projectId: string) => {
    const sec = sections.find((s) => s.projectId === projectId)
    return runAll((id) => addToProject(id, projectId, sec?.id, currentUserId!)).then(() => {
      setProjectOpen(false)
      onClear()
    })
  }

  const bulkMoveSection = (sectionId: string) =>
    runAll((id) => setSectionForProject(id, currentProjectId, sectionId, currentUserId!)).then(() => {
      setSectionOpen(false)
      onClear()
    })

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border px-4 py-2 shadow-md"
      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
    >
      <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
        {ids.length} selected
      </span>
      <Button size="sm" variant="outline" onClick={() => void bulkComplete()}>
        <Check className="mr-1 h-4 w-4" /> Mark complete
      </Button>
      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <UserPlus className="mr-1 h-4 w-4" /> Assign to…
          </Button>
        </PopoverTrigger>
        <TasklyticPopoverContent className="w-52 p-2">
          <ul className="max-h-48 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[hsl(var(--surface-muted))]" onClick={() => void bulkAssign(u.id)}>
                  <UserAvatar userId={u.id} size="sm" showPresence={false} />
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        </TasklyticPopoverContent>
      </Popover>
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <CalendarIcon className="mr-1 h-4 w-4" /> Set due date…
          </Button>
        </PopoverTrigger>
        <TasklyticPopoverContent className="w-fit p-2">
          <div className="mb-2 flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => void bulkDue(toISODate(startOfToday()))}>Today</Button>
            <Button size="sm" variant="ghost" onClick={() => void bulkDue(toISODate(addDays(startOfToday(), 7)))}>+1 week</Button>
            <Button size="sm" variant="ghost" onClick={() => void bulkDue(null)}>Clear</Button>
          </div>
          <Calendar mode="single" onSelect={(d) => d && void bulkDue(toISODate(d))} />
        </TasklyticPopoverContent>
      </Popover>
      <Popover open={sectionOpen} onOpenChange={setSectionOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <FolderInput className="mr-1 h-4 w-4" /> Move to section…
          </Button>
        </PopoverTrigger>
        <TasklyticPopoverContent className="z-[100] w-52 p-2">
          <ul className="max-h-48 overflow-y-auto">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
                  onClick={() => void bulkMoveSection(s.id)}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </TasklyticPopoverContent>
      </Popover>
      <Popover open={projectOpen} onOpenChange={setProjectOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <FolderPlus className="mr-1 h-4 w-4" /> Add to project…
          </Button>
        </PopoverTrigger>
        <TasklyticPopoverContent className="w-52 p-2">
          <ul className="max-h-48 overflow-y-auto">
            {projects.filter((p) => p.id !== currentProjectId).map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]" onClick={() => void bulkAddProject(p.id)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </TasklyticPopoverContent>
      </Popover>
      <Button size="sm" variant="destructive" onClick={() => void bulkDelete()}>
        <Trash2 className="mr-1 h-4 w-4" /> Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="mr-1 h-4 w-4" /> Clear
      </Button>
    </div>
  )
}
