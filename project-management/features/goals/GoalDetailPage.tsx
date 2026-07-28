'use client'

/** Full goal detail page — header, tabs, progress control, follow. */
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageMeta } from '../../hooks/usePageMeta'
import { formatDate } from '../../lib/time'
import { getProjectCompletionPercent } from '../../lib/goals/goalActions'
import { isFollowingGoal, toggleGoalFollow } from '../../lib/goals/goalMeta'
import { getChildGoals } from '../../lib/goals/goalTree'
import { useGoalProgress } from '../../lib/goals/goalProgress'
import { useAuthStore } from '../../stores/auth'
import {
  useGoalsStore,
  useProjectsStore,
  useStatusUpdatesStore,
  useUsersStore,
} from '../../stores/entities'
import type { Goal } from '../../types'
import { CreateOrEditGoalModal } from './CreateOrEditGoalModal'
import { GoalProgressBar } from './GoalProgressBar'
import { GoalProgressRing } from './GoalProgressRing'
import { GoalStatusPill } from './GoalStatusPill'
import { GoalStatusUpdateComposer } from './GoalStatusUpdateComposer'
import { GoalUpdateProgressDialog } from './GoalUpdateProgressDialog'

type Props = {
  goalId: string
  workspaceId: string
}

/** Goal detail route content. */
export function GoalDetailPage({ goalId, workspaceId }: Props) {
  const goal = useGoalsStore((s) => s.getById(goalId))
  const allGoals = useGoalsStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const currentUserId = useAuthStore((s) => s.currentUserId) ?? ''
  const owner = useUsersStore((s) => (goal ? s.getById(goal.ownerId) : undefined))
  const parent = useGoalsStore((s) => (goal?.parentGoalId ? s.getById(goal.parentGoalId) : undefined))
  const { percent, isProjectDriven, isAutoProgress } = useGoalProgress(goalId)
  const children = goal ? getChildGoals(allGoals, goal.id) : []
  const updates = useStatusUpdatesStore((s) =>
    s.list().filter((u) => u.scope.type === 'goal' && u.scope.id === goalId)
  )

  const [editOpen, setEditOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [following, setFollowing] = useState(() => isFollowingGoal(goalId, currentUserId))

  usePageMeta({
    breadcrumbs: [
      { label: 'Goals', href: `/dashboard/project-management/w/${workspaceId}/goals` },
      { label: goal?.name ?? 'Goal' },
    ],
  })

  if (!goal || goal.workspaceId !== workspaceId) {
    return (
      <div className="tl-card p-8 text-center">
        <p style={{ color: 'var(--ink-muted)' }}>Goal not found.</p>
        <Link href={`/dashboard/project-management/w/${workspaceId}/goals`} className="mt-2 inline-block text-sm underline">
          Back to goals
        </Link>
      </div>
    )
  }

  const handleFollow = () => {
    const next = toggleGoalFollow(goalId, currentUserId)
    setFollowing(next)
  }

  return (
    <div className="space-y-6">
      <div className="tl-card flex flex-wrap items-start gap-6 p-6 shadow-paper-sm">
        <GoalProgressRing percent={percent} status={goal.status} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <GoalStatusPill status={goal.status} />
            {isProjectDriven ? <Badge variant="outline">Project-driven</Badge> : null}
            {isAutoProgress ? <Badge variant="secondary">Auto progress</Badge> : null}
          </div>
          <h1 className="font-serif text-3xl">{goal.name}</h1>
          {goal.description ? <p style={{ color: 'var(--ink-secondary)' }}>{goal.description}</p> : null}
          <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
            <span className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback style={{ background: owner?.avatarColor }}>{owner?.name?.[0]}</AvatarFallback>
              </Avatar>
              {owner?.name}
            </span>
            <span>·</span>
            <span>{formatDate(goal.timeFrame.start)} – {formatDate(goal.timeFrame.end)}</span>
          </div>
          <GoalProgressBar percent={percent} status={goal.status} className="max-w-md" />
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => setProgressOpen(true)}>Update progress</Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button size="sm" variant={following ? 'secondary' : 'outline'} onClick={handleFollow}>
            {following ? 'Following' : 'Follow'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="subgoals">Sub-goals</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 space-y-4">
          <MetricBlock goal={goal} />
          {parent ? (
            <Section title="Parent goal">
              <Link href={`/dashboard/project-management/w/${workspaceId}/goals/${parent.id}`} className="text-sm underline">{parent.name}</Link>
            </Section>
          ) : null}
          <Section title="Supporting projects">
            {goal.supportingProjectIds.length ? (
              <ul className="space-y-2">
                {goal.supportingProjectIds.map((pid) => {
                  const p = projects.find((x) => x.id === pid)
                  if (!p) return null
                  const pct = getProjectCompletionPercent(pid)
                  return (
                    <li key={pid} className="flex items-center justify-between rounded-lg p-2 text-sm" style={{ background: 'var(--bg-muted)' }}>
                      <Link href={`/dashboard/project-management/w/${workspaceId}/projects/${p.id}`}>{p.iconEmoji ?? '📁'} {p.name}</Link>
                      <span className="tabular-nums">{pct}% complete</span>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No linked projects.</p>}
          </Section>
        </TabsContent>
        <TabsContent value="updates" className="mt-4">
          <GoalStatusUpdateComposer goal={goal} currentUserId={currentUserId} />
        </TabsContent>
        <TabsContent value="subgoals" className="mt-4 space-y-2">
          {children.map((c) => (
            <Link key={c.id} href={`/dashboard/project-management/w/${workspaceId}/goals/${c.id}`} className="block rounded-lg p-3 text-sm" style={{ background: 'var(--bg-muted)' }}>
              {c.name}
            </Link>
          ))}
          {!children.length && <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No sub-goals.</p>}
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ul className="space-y-2 text-sm">
            {updates.map((u) => (
              <li key={u.id} className="rounded-lg p-2" style={{ background: 'var(--bg-muted)' }}>
                Status update: {u.title} — {u.status.replace(/_/g, ' ')}
              </li>
            ))}
            {!updates.length && <p style={{ color: 'var(--ink-muted)' }}>No activity yet.</p>}
          </ul>
        </TabsContent>
      </Tabs>

      <CreateOrEditGoalModal open={editOpen} onOpenChange={setEditOpen} workspaceId={workspaceId} goal={goal} />
      <GoalUpdateProgressDialog goal={goal} currentUserId={currentUserId} open={progressOpen} onOpenChange={setProgressOpen} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-medium">{title}</h3>
      {children}
    </div>
  )
}

function MetricBlock({ goal }: { goal: Goal }) {
  const m = goal.metric
  if (m.type === 'manual') {
    return <p className="text-sm">Manual status: <strong>{m.status.replace(/_/g, ' ')}</strong></p>
  }
  const label = m.type === 'currency' ? m.symbol : m.type === 'numeric' ? (m.unit ?? '') : '%'
  return (
    <p className="text-sm">
      Metric: <strong>{m.current}</strong> / {m.target} {label}
    </p>
  )
}
