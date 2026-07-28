'use client'

/**
 * CommentsAndActivity — Comments with @mentions, reactions, edit/delete; Activity tab.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActivityStore, useCommentsStore } from '../../stores/entities'
import type { Task } from '../../types'
import { ActivityTab } from './comments/ActivityTab'
import { CommentsTab } from './comments/CommentsTab'

type Props = { task: Task }

/** Task detail tabs for comments and activity feed. */
export function CommentsAndActivity({ task }: Props) {
  const commentCount = useCommentsStore((s) => s.list().filter((c) => c.taskId === task.id).length)
  const activityCount = useActivityStore((s) => s.list().filter((a) => a.taskId === task.id).length)

  return (
    <section className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <Tabs defaultValue="comments">
        <TabsList
          className="mb-3 h-auto w-full gap-1 rounded-lg p-1"
          style={{ background: 'var(--bg-muted)' }}
        >
          <TabsTrigger value="comments" className="flex-1 capitalize data-[state=active]:shadow-paper-sm">
            Comments{commentCount ? ` (${commentCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 capitalize data-[state=active]:shadow-paper-sm">
            Activity{activityCount ? ` (${activityCount})` : ''}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="comments">
          <CommentsTab task={task} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab task={task} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
