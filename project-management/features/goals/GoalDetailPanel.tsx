'use client'

/** Side panel — goal detail, updates, and linked work (tree view click). */
import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Goal } from '../../types'
import { formatDate } from '../../lib/time'
import { getChildGoals } from '../../lib/goals/goalTree'
import { useGoalProgress } from '../../lib/goals/goalProgress'
import { useGoalsStore, useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { GoalProgressBar } from './GoalProgressBar'
import { GoalStatusPill } from './GoalStatusPill'
import { GoalStatusUpdateComposer } from './GoalStatusUpdateComposer'

type Props = {
  goal: Goal
  workspaceId: string
  currentUserId: string
  onClose: () => void
}

/** Collapsible side panel for quick goal inspection from tree view. */
export function GoalDetailPanel({ goal, workspaceId, currentUserId, onClose }: Props) {
  const owner = useUsersStore((s) => s.getById(goal.ownerId))
  const projects = useProjectsStore((s) => s.list())
  const allGoals = useGoalsStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list())
  const { percent } = useGoalProgress(goal.id)
  const children = getChildGoals(allGoals, goal.id)
  const [tab, setTab] = useState('overview')

  const linkedTasks = tasks.filter(
    (t) =>
      goal.supportingProjectIds.some((pid) => t.projectIds.includes(pid)) &&
      t.tagIds.some((tag) => tag === `linked-to-${goal.id}`)
  )

  return (
    <aside
      className="tl-card fixed right-4 top-20 z-40 flex h-[calc(100vh-6rem)] w-full max-w-md flex-col overflow-hidden shadow-lg"
     
    >
      <div className="flex items-start justify-between border-b p-4" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="min-w-0 flex-1">
          <GoalStatusPill status={goal.status} />
          <h2 className="mt-1 font-sans text-lg">{goal.name}</h2>
          <GoalProgressBar percent={percent} status={goal.status} className="mt-2" />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="subgoals">Sub-goals</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="mt-0 space-y-3 text-sm">
            {goal.description ? <p style={{ color: 'hsl(var(--foreground-muted))' }}>{goal.description}</p> : null}
            <p><span style={{ color: 'hsl(var(--foreground-muted))' }}>Owner:</span> {owner?.name}</p>
            <p><span style={{ color: 'hsl(var(--foreground-muted))' }}>Period:</span> {formatDate(goal.timeFrame.start)} – {formatDate(goal.timeFrame.end)}</p>
            {goal.supportingProjectIds.length ? (
              <div>
                <p className="mb-1 font-medium">Supporting projects</p>
                <ul className="space-y-1">
                  {goal.supportingProjectIds.map((pid) => {
                    const p = projects.find((x) => x.id === pid)
                    return p ? <li key={pid}>{p.iconEmoji ?? '📁'} {p.name}</li> : null
                  })}
                </ul>
              </div>
            ) : null}
            <Link href={`/dashboard/project-management/w/${workspaceId}/goals/${goal.id}`} className="text-sm underline" style={{ color: 'hsl(var(--primary))' }}>
              Open full detail →
            </Link>
          </TabsContent>
          <TabsContent value="updates" className="mt-0">
            <GoalStatusUpdateComposer goal={goal} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value="subgoals" className="mt-0 space-y-2">
            {children.length ? children.map((c) => (
              <Link key={c.id} href={`/dashboard/project-management/w/${workspaceId}/goals/${c.id}`} className="block rounded-lg p-2 text-sm hover:bg-muted" style={{ background: 'hsl(var(--surface-muted))' }}>
                {c.name}
              </Link>
            )) : <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No sub-goals yet.</p>}
          </TabsContent>
        </div>
      </Tabs>

      {linkedTasks.length ? (
        <div className="border-t p-4 text-xs" style={{ borderColor: 'hsl(var(--border))' }}>
          <p className="mb-1 font-medium">Linked work ({linkedTasks.length})</p>
          {linkedTasks.slice(0, 3).map((t) => <p key={t.id} style={{ color: 'hsl(var(--foreground-muted))' }}>{t.name}</p>)}
        </div>
      ) : null}
    </aside>
  )
}
