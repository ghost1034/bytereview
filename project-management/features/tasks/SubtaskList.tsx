'use client'

/**
 * SubtaskList — nested subtask tree (up to 5 levels) with DnD reparent and breadcrumbs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useTasksStore } from '../../stores/entities'
import { createSubtask, reparentTask, toggleComplete } from '../../lib/taskActions'
import {
  MAX_DEPTH,
  SUBTASK_INDENT_PX,
  canAddSubtask,
  getBreadcrumbChain,
  getChildren,
  getSubtaskCounts,
  getSubtaskProgress,
  isRenderedAsSeparator,
} from '../../lib/subtasks'
import { useTaskDetailUrl } from './useTaskDetailUrl'
import type { Task } from '../../types'

type SubtaskListProps = { task: Task }

type BreadcrumbProps = {
  task: Task
  /** First project id for the project crumb when available. */
  projectId?: string
}

type NodeProps = {
  item: Task
  depth: number
  rootId: string
  expanded: Set<string>
  toggleExpand: (id: string) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  dropHint: DropHint | null
  setDropHint: (hint: DropHint | null) => void
  onReparent: (taskId: string, newParentId: string | null) => void
  onOpen: (id: string) => void
  actorId: string | undefined
}

type DropHint = { taskId: string; mode: 'child' | 'outdent' }

/** Breadcrumb stack for detail pane header — ancestors + current task. */
export function SubtaskBreadcrumbs({ task, projectId }: BreadcrumbProps) {
  const allTasks = useTasksStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const { openTask } = useTaskDetailUrl()
  const chain = useMemo(() => getBreadcrumbChain(task.id, allTasks), [allTasks, task.id])
  const ancestors = chain.slice(0, -1)
  const project = projectId ? projects.find((p) => p.id === projectId) : projects.find((p) => task.projectIds.includes(p.id))
  const parent = ancestors[ancestors.length - 1]

  if (!task.parentId && !project) return null

  const goUp = () => {
    if (parent) openTask(parent.id)
  }

  return (
    <nav className="mb-1 flex items-center gap-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }} aria-label="Task hierarchy">
      {parent ? (
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Go up one level" onClick={goUp}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {project ? (
        <>
          <span className="truncate">{project.name}</span>
          <span className="opacity-50">›</span>
        </>
      ) : null}
      {ancestors.map((a) => (
        <span key={a.id} className="flex min-w-0 items-center gap-1">
          <button type="button" className="truncate hover:underline" onClick={() => openTask(a.id)}>
            {a.name}
          </button>
          <span className="opacity-50">›</span>
        </span>
      ))}
      <span className="truncate font-medium" style={{ color: 'hsl(var(--foreground))' }}>
        {task.name}
      </span>
    </nav>
  )
}

function InlineAddRow({
  parentId,
  depth,
  actorId,
  inputRef,
}: {
  parentId: string
  depth: number
  actorId: string | undefined
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const allTasks = useTasksStore((s) => s.list())
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? localRef
  const blocked = !canAddSubtask(parentId, allTasks)

  const submit = async () => {
    if (!actorId || !name.trim()) return
    setError(null)
    const result = await createSubtask(parentId, name.trim(), actorId)
    if (result.error) {
      setError(result.error)
      return
    }
    setName('')
    ref.current?.focus()
  }

  return (
    <li className="py-0.5" style={{ paddingLeft: depth * SUBTASK_INDENT_PX }}>
      {blocked ? (
        <p className="py-1 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
          Maximum depth of {MAX_DEPTH} levels reached.
        </p>
      ) : (
        <div className="space-y-0.5">
          <Input
            ref={ref}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add subtask"
            className="tl-input h-7 border-dashed text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          {error ? (
            <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
              {error}
            </p>
          ) : null}
        </div>
      )}
    </li>
  )
}

function SubtaskNode({
  item,
  depth,
  rootId,
  expanded,
  toggleExpand,
  dragId,
  setDragId,
  dropHint,
  setDropHint,
  onReparent,
  onOpen,
  actorId,
}: NodeProps) {
  const allTasks = useTasksStore((s) => s.list())
  const children = useMemo(() => getChildren(item.id, allTasks), [allTasks, item.id])
  const hasKids = children.length > 0
  const isOpen = expanded.has(item.id)
  const progress = getSubtaskProgress(item.id, allTasks)
  const separator = isRenderedAsSeparator(item)
  const canAddChild = canAddSubtask(item.id, allTasks)

  if (separator) {
    return (
      <li
        className="py-1 text-xs font-semibold uppercase tracking-wide"
        style={{ paddingLeft: depth * SUBTASK_INDENT_PX, color: 'hsl(var(--foreground-muted))' }}
      >
        {item.name.replace(/:$/, '')}
      </li>
    )
  }

  const handleDrop = (mode: 'child' | 'outdent') => {
    if (!dragId || dragId === item.id) return
    const newParent = mode === 'child' ? item.id : item.parentId ?? null
    onReparent(dragId, newParent)
    setDragId(null)
    setDropHint(null)
  }

  return (
    <>
      <li
        className="group flex h-7 items-center gap-1 rounded-md text-sm hover:bg-[hsl(var(--surface-muted))]"
        style={{ paddingLeft: depth * SUBTASK_INDENT_PX }}
        onDragOver={(e) => {
          if (!dragId) return
          e.preventDefault()
          setDropHint({ taskId: item.id, mode: 'outdent' })
        }}
        onDrop={(e) => {
          e.preventDefault()
          handleDrop('outdent')
        }}
      >
        <span
          draggable
          onDragStart={() => setDragId(item.id)}
          onDragEnd={() => {
            setDragId(null)
            setDropHint(null)
          }}
          className="cursor-grab opacity-0 group-hover:opacity-60"
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={() => hasKids && toggleExpand(item.id)}
          onDragOver={(e) => {
            if (!dragId || dragId === item.id) return
            e.preventDefault()
            e.stopPropagation()
            setDropHint({ taskId: item.id, mode: 'child' })
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleDrop('child')
          }}
          style={{
            visibility: hasKids ? 'visible' : 'hidden',
            outline: dropHint?.taskId === item.id && dropHint.mode === 'child' ? '2px solid hsl(var(--success))' : undefined,
          }}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => actorId && void toggleComplete(item.id, actorId)}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: item.completed ? 'hsl(var(--success))' : 'hsl(var(--border))',
            background: item.completed ? 'hsl(var(--success-soft))' : 'transparent',
          }}
          aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {item.completed ? <Check className="h-2.5 w-2.5" style={{ color: 'hsl(var(--success))' }} /> : null}
        </button>
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left ${item.completed ? 'line-through' : ''}`}
          style={{ color: item.completed ? 'hsl(var(--foreground-muted))' : 'hsl(var(--foreground))' }}
          onClick={() => onOpen(item.id)}
        >
          {item.name}
        </button>
        {progress.total > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {progress.done}/{progress.total}
          </span>
        ) : null}
      </li>
      {isOpen
        ? children.map((child) => (
            <SubtaskNode
              key={child.id}
              item={child}
              depth={depth + 1}
              rootId={rootId}
              expanded={expanded}
              toggleExpand={toggleExpand}
              dragId={dragId}
              setDragId={setDragId}
              dropHint={dropHint}
              setDropHint={setDropHint}
              onReparent={onReparent}
              onOpen={onOpen}
              actorId={actorId}
            />
          ))
        : null}
      {isOpen && canAddChild ? (
        <InlineAddRow parentId={item.id} depth={depth + 1} actorId={actorId} />
      ) : null}
    </>
  )
}

/** Nested subtask section for the task detail pane. */
export function SubtaskList({ task }: SubtaskListProps) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const allTasks = useTasksStore((s) => s.list())
  const { openTask } = useTaskDetailUrl()
  const rootAddRef = useRef<HTMLInputElement>(null)
  const children = useMemo(() => getChildren(task.id, allTasks), [allTasks, task.id])
  const counts = getSubtaskCounts(task.id, allTasks)
  const [sectionOpen, setSectionOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [rootAdding, setRootAdding] = useState(false)

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onReparent = useCallback(
    async (taskId: string, newParentId: string | null) => {
      if (!currentUserId) return
      await reparentTask(taskId, newParentId, currentUserId)
    },
    [currentUserId]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 's' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      setRootAdding(true)
      setSectionOpen(true)
      setTimeout(() => rootAddRef.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const depthBlocked = !canAddSubtask(task.id, allTasks)

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'hsl(var(--foreground-muted))' }}
          onClick={() => setSectionOpen((o) => !o)}
        >
          {sectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Subtasks{counts.num_subtasks ? ` · ${counts.num_subtasks}` : ''}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Add subtask (s)"
          onClick={() => {
            setRootAdding(true)
            setSectionOpen(true)
            setTimeout(() => rootAddRef.current?.focus(), 0)
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {sectionOpen ? (
        <ul className="space-y-0">
          {dragId ? (
            <li
              className="mb-1 rounded border border-dashed py-1 text-center text-[10px]"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (!dragId) return
                void onReparent(dragId, task.parentId ?? null)
                setDragId(null)
                setDropHint(null)
              }}
            >
              Drop to move out one level
            </li>
          ) : null}
          {children.map((child) => (
            <SubtaskNode
              key={child.id}
              item={child}
              depth={0}
              rootId={task.id}
              expanded={expanded}
              toggleExpand={toggleExpand}
              dragId={dragId}
              setDragId={setDragId}
              dropHint={dropHint}
              setDropHint={setDropHint}
              onReparent={onReparent}
              onOpen={openTask}
              actorId={currentUserId ?? undefined}
            />
          ))}
          {rootAdding || children.length === 0 ? (
            depthBlocked ? (
              <li className="py-1 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                Maximum depth of {MAX_DEPTH} levels reached.
              </li>
            ) : (
              <InlineAddRow parentId={task.id} depth={0} actorId={currentUserId ?? undefined} inputRef={rootAddRef} />
            )
          ) : (
            <li className="py-0.5">
              <button
                type="button"
                className="text-xs hover:underline"
                style={{ color: 'hsl(var(--foreground-muted))' }}
                onClick={() => setRootAdding(true)}
              >
                + Add subtask
              </button>
            </li>
          )}
        </ul>
      ) : null}
    </section>
  )
}
