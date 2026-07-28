'use client'

import type { ProjectActivityDigest } from './summaries'

type Props = {
  digest: ProjectActivityDigest
  tasksAdded: number
}

/** Read-only inline prompts derived from current project activity. */
export function StatusDataPrompts({ digest, tasksAdded }: Props) {
  const milestoneNames = digest.recentMilestones.slice(0, 3).map((m) => m.name).join(', ')

  return (
    <div
      className="rounded-lg p-3 text-xs space-y-1"
      style={{ background: 'var(--bg-muted)', color: 'var(--ink-secondary)' }}
    >
      <p className="font-medium" style={{ color: 'var(--ink-primary)' }}>
        This week at a glance
      </p>
      <p>Tasks completed this week: {digest.tasksCompleted.length}</p>
      <p>Tasks added this week: {tasksAdded}</p>
      <p>
        Upcoming milestones:{' '}
        {milestoneNames || digest.upcomingDue.slice(0, 3).map((t) => t.name).join(', ') || 'None'}
      </p>
      {digest.tasksOverdue.length ? (
        <p style={{ color: 'var(--danger)' }}>Overdue tasks: {digest.tasksOverdue.length}</p>
      ) : null}
    </div>
  )
}
