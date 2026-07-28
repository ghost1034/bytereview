'use client'

/** Tree view — hierarchical goals with drag re-parent and project chips. */
import { useCallback, useMemo, useState } from 'react'
import type { Goal, Project } from '../../types'
import { reparentGoal } from '../../lib/goals/goalActions'
import { buildGoalTree, type GoalTreeNode } from '../../lib/goals/goalTree'
import { useProjectsStore } from '../../stores/entities'
import { GoalCard } from './GoalCard'

type Props = {
  goals: Goal[]
  workspaceId: string
  selectedId?: string
  onSelect: (goal: Goal) => void
}

function ProjectChips({ projectIds, projects }: { projectIds: string[]; projects: Project[] }) {
  const linked = projects.filter((p) => projectIds.includes(p.id))
  if (!linked.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1 pl-6">
      {linked.map((p) => (
        <span
          key={p.id}
          className="rounded-full px-2 py-0.5 text-[10px]"
          style={{ background: 'var(--bg-muted)', color: 'var(--ink-secondary)' }}
        >
          {p.iconEmoji ?? '📁'} {p.name}
        </span>
      ))}
    </div>
  )
}

function TreeBranch({
  node,
  workspaceId,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  dragId,
  setDragId,
  projects,
}: {
  node: GoalTreeNode
  workspaceId: string
  expanded: Set<string>
  onToggle: (id: string) => void
  selectedId?: string
  onSelect: (g: Goal) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  projects: Project[]
}) {
  const isExpanded = expanded.has(node.goal.id)
  const hasChildren = node.children.length > 0

  const handleDrop = useCallback(async () => {
    if (dragId && dragId !== node.goal.id) {
      await reparentGoal(dragId, node.goal.id)
      setDragId(null)
    }
  }, [dragId, node.goal.id, setDragId])

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => void handleDrop()}
      >
        <GoalCard
          goal={node.goal}
          workspaceId={workspaceId}
          depth={node.depth}
          expanded={isExpanded}
          hasChildren={hasChildren}
          onToggle={() => onToggle(node.goal.id)}
          onSelect={() => onSelect(node.goal)}
          selected={selectedId === node.goal.id}
          draggable
          onDragStart={() => setDragId(node.goal.id)}
        />
        <ProjectChips projectIds={node.goal.supportingProjectIds} projects={projects} />
      </div>
      {isExpanded
        ? node.children.map((child) => (
            <TreeBranch
              key={child.goal.id}
              node={child}
              workspaceId={workspaceId}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              dragId={dragId}
              setDragId={setDragId}
              projects={projects}
            />
          ))
        : null}
    </div>
  )
}

/** CSS-column tree layout with expand/collapse and drag re-parent. */
export function GoalsTreeView({ goals, workspaceId, selectedId, onSelect }: Props) {
  const projects = useProjectsStore((s) => s.list())
  const tree = useMemo(() => buildGoalTree(goals), [goals])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(goals.map((g) => g.id)))
  const [dragId, setDragId] = useState<string | null>(null)

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRootDrop = async () => {
    if (dragId) {
      await reparentGoal(dragId, undefined)
      setDragId(null)
    }
  }

  return (
    <div
      className="columns-1 gap-4 space-y-4 lg:columns-2 xl:columns-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => void handleRootDrop()}
    >
      {tree.map((node) => (
        <div key={node.goal.id} className="mb-4 break-inside-avoid">
          <TreeBranch
            node={node}
            workspaceId={workspaceId}
            expanded={expanded}
            onToggle={toggle}
            selectedId={selectedId}
            onSelect={onSelect}
            dragId={dragId}
            setDragId={setDragId}
            projects={projects}
          />
        </div>
      ))}
    </div>
  )
}
