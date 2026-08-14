'use client'

/** Task detail tabs — Comments, Activity, Time, Expenses. */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActivityStore, useCommentsStore } from '../../stores/entities'
import { TaskExpensesTab } from '../psa/expenses/TaskExpensesTab'
import { TaskTimeTab } from '../psa/time/TaskTimeTab'
import type { Task } from '../../types'
import { ActivityTab } from './comments/ActivityTab'
import { CommentsTab } from './comments/CommentsTab'

type Props = { task: Task; commentsRef?: React.RefObject<HTMLDivElement | null> }

/** Combined task detail bottom tabs including PSA time and expenses. */
export function TaskDetailTabs({ task, commentsRef }: Props) {
  const commentCount = useCommentsStore((s) => s.list().filter((c) => c.taskId === task.id).length)
  const activityCount = useActivityStore((s) => s.list().filter((a) => a.taskId === task.id).length)

  return (
    <section className="mt-6 border-t pt-4" style={{ borderColor: 'hsl(var(--border))' }}>
      <Tabs defaultValue="comments">
        <TabsList
          className="mb-3 h-auto w-full gap-1 overflow-x-auto rounded-lg p-1"
          style={{ background: 'hsl(var(--surface-muted))' }}
          aria-label="Task detail sections"
        >
          <TabsTrigger value="comments" className="shrink-0 capitalize data-[state=active]:shadow-sm">
            Comments{commentCount ? ` (${commentCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="activity" className="shrink-0 capitalize data-[state=active]:shadow-sm">
            Activity{activityCount ? ` (${activityCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="time" className="shrink-0 capitalize data-[state=active]:shadow-sm">
            Time
          </TabsTrigger>
          <TabsTrigger value="expenses" className="shrink-0 capitalize data-[state=active]:shadow-sm">
            Expenses
          </TabsTrigger>
        </TabsList>
        <TabsContent value="comments">
          <div ref={commentsRef}>
            <CommentsTab task={task} />
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab task={task} />
        </TabsContent>
        <TabsContent value="time">
          <TaskTimeTab task={task} />
        </TabsContent>
        <TabsContent value="expenses">
          <TaskExpensesTab task={task} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
