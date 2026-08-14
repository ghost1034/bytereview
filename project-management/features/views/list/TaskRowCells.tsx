'use client'

/**
 * TaskRowCells — assignee, due, tags, projects, and custom field cells.
 */
import { useState } from 'react'
import { addDays, nextMonday, startOfToday } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { TasklyticPopoverContent } from '../../ui/TasklyticPopoverContent'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import type { CustomField, Project, Tag, Task, User } from '../../../types'
import { assign, setDue, addTagToTask, removeTagFromTask } from '../../../lib/taskActions'
import { toISODate, parseISODateLocal } from '../../../lib/time'
import { useAuthStore } from '../../../stores/auth'
import { FieldValueEditor } from '../../custom-fields/FieldValueEditor'
import { findFieldByName } from '../../custom-fields/useProjectFields'
import { TagPicker } from '../../tasks/TagPicker'
import { UserAvatar } from '../../profile/UserAvatar'
import { dueDisplay } from './listUtils'
import type { ColumnDef, ListColumnId } from '../../../stores/columns'
import { parseCustomFieldColumnId } from '../../../stores/columns'

type CellProps = {
  column: ColumnDef
  task: Task
  users: User[]
  tags: Tag[]
  projects: Project[]
  projectFields: CustomField[]
  customFieldMap: Record<string, CustomField>
  workspaceId: string
}

/** Render a single data cell for a task row. */
export function TaskRowCell(props: CellProps) {
  const { column, task } = props
  const cfId = parseCustomFieldColumnId(String(column.id))
  if (cfId) {
    const field = props.customFieldMap[cfId] ?? props.projectFields.find((f) => f.id === cfId)
    if (!field) return <span style={{ color: 'hsl(var(--foreground-subtle))' }}>—</span>
    return <FieldValueEditor task={task} field={field} compact allFields={props.projectFields} />
  }

  switch (column.id as ListColumnId) {
    case 'name':
      return null
    case 'assignee':
      return <AssigneeCell task={task} users={props.users} />
    case 'dueOn':
      return <DueCell task={task} />
    case 'priority':
    case 'status': {
      const fieldName = column.id === 'priority' ? 'Priority' : 'Status'
      const field = findFieldByName(props.workspaceId, fieldName)
      if (!field) return <span style={{ color: 'hsl(var(--foreground-muted))' }}>—</span>
      return <FieldValueEditor task={task} field={field} compact />
    }
    case 'tags':
      return <TagsCell task={task} tags={props.tags} workspaceId={props.workspaceId} />
    case 'projects':
      return <ProjectsCell task={task} projects={props.projects} />
    default:
      return null
  }
}

function AssigneeCell({ task, users }: { task: Task; users: User[] }) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const assignee = users.find((u) => u.id === task.assigneeId)
  const filtered = users.filter(
    (u) =>
      !query.trim() ||
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  )

  const pick = async (userId: string | undefined) => {
    if (!currentUserId) return
    await assign(task.id, userId, currentUserId)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-w-0 items-center gap-1.5 truncate text-sm" onClick={(e) => e.stopPropagation()}>
          {assignee ? (
            <>
              <UserAvatar userId={assignee.id} size="sm" showPresence={false} />
              <span className="truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>{assignee.name}</span>
            </>
          ) : (
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>—</span>
          )}
        </button>
      </PopoverTrigger>
      <TasklyticPopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="tl-input h-8 text-sm" autoFocus />
        <ul className="mt-2 max-h-40 overflow-y-auto">
          {filtered.map((u) => (
            <li key={u.id}>
              <button type="button" className="tl-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm" onClick={() => void pick(u.id)}>
                <UserAvatar userId={u.id} size="sm" showPresence={false} />
                {u.name}
              </button>
            </li>
          ))}
        </ul>
        {currentUserId ? (
          <button type="button" className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs" style={{ color: 'hsl(var(--primary))' }} onClick={() => void pick(currentUserId)}>
            Assign to me
          </button>
        ) : null}
      </TasklyticPopoverContent>
    </Popover>
  )
}

function DueCell({ task }: { task: Task }) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)
  const { label, color } = dueDisplay(task)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-sm" style={{ color }} onClick={(e) => e.stopPropagation()}>
          <CalendarIcon className="h-3 w-3" style={{ color: 'hsl(var(--foreground-subtle))' }} />
          {label}
        </button>
      </PopoverTrigger>
      <TasklyticPopoverContent className="w-fit p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex flex-wrap gap-1">
          {[
            { label: 'Today', date: startOfToday() },
            { label: 'Tomorrow', date: addDays(startOfToday(), 1) },
            { label: 'Next Monday', date: nextMonday(startOfToday()) },
          ].map((q) => (
            <button key={q.label} type="button" className="rounded px-2 py-0.5 text-xs hover:bg-[hsl(var(--surface-muted))]" onClick={() => currentUserId && void setDue(task.id, { dueOn: toISODate(q.date) }, currentUserId)}>
              {q.label}
            </button>
          ))}
          <button type="button" className="rounded px-2 py-0.5 text-xs" style={{ color: 'hsl(var(--destructive))' }} onClick={() => currentUserId && void setDue(task.id, { dueOn: null }, currentUserId)}>
            Clear
          </button>
        </div>
        <Calendar mode="single" selected={task.dueOn ? parseISODateLocal(task.dueOn) : undefined} onSelect={(d) => d && currentUserId && void setDue(task.id, { dueOn: toISODate(d) }, currentUserId)} />
      </TasklyticPopoverContent>
    </Popover>
  )
}

function TagsCell({ task, tags, workspaceId }: { task: Task; tags: Tag[]; workspaceId: string }) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const selected = task.tagIds.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[]
  return (
    <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
      {selected.length ? (
        <div className="flex flex-wrap gap-0.5">
          {selected.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="h-5 px-1.5 text-[10px]" style={{ background: `${tag.color}22`, color: tag.color }}>
              {tag.name}
            </Badge>
          ))}
        </div>
      ) : null}
      <TagPicker
        workspaceId={workspaceId}
        selectedIds={task.tagIds}
        onAdd={(id) => currentUserId && void addTagToTask(task.id, id, currentUserId)}
        onRemove={(id) => currentUserId && void removeTagFromTask(task.id, id, currentUserId)}
      />
    </div>
  )
}

function ProjectsCell({ task, projects }: { task: Task; projects: Project[] }) {
  const chips = task.projectIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as Project[]
  if (!chips.length) return <span style={{ color: 'hsl(var(--foreground-muted))' }}>—</span>
  return (
    <div className="flex flex-wrap gap-0.5">
      {chips.map((p) => (
        <Badge key={p.id} variant="outline" className="h-5 max-w-full truncate px-1.5 text-[10px]">
          {p.name}
        </Badge>
      ))}
    </div>
  )
}
