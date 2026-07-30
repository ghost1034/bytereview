'use client'

import Link from 'next/link'
import {
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Sparkles,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionShell } from '@/components/pages/home/shared/SectionShell'
import { FeatureList } from '@/components/pages/home/shared/FeatureList'
import { BrowserFrame } from '@/components/pages/home/shared/BrowserFrame'
import { accent } from '@/components/pages/home/shared/tones'

const TONE = 'indigo'
const a = accent(TONE)

const HIGHLIGHTS = [
  { title: 'Switch between list, board, timeline, and calendar views' },
  { title: 'Coordinate owners, due dates, dependencies, and team goals' },
  { title: 'Capture requests with forms and track time and budgets' },
  { title: 'Use AI to draft updates, suggest subtasks, and keep work moving' },
]

const COLUMNS = [
  {
    title: 'To do',
    count: 3,
    tasks: [
      { title: 'Collect client PBC files', meta: 'Aug 1', avatars: ['AM', 'JL'] },
      { title: 'Map close dependencies', meta: 'Aug 2', avatars: ['RK'] },
    ],
  },
  {
    title: 'In progress',
    count: 2,
    tasks: [
      { title: 'Review revenue schedules', meta: 'Today', avatars: ['JL'] },
      { title: 'Prepare variance notes', meta: 'Aug 4', avatars: ['AM'] },
    ],
  },
  {
    title: 'Complete',
    count: 4,
    tasks: [
      { title: 'Confirm reporting scope', meta: 'Completed', avatars: ['RK'] },
      { title: 'Assign workstream owners', meta: 'Completed', avatars: ['AM', 'JL'] },
    ],
  },
]

function ProjectManagementMockup() {
  return (
    <BrowserFrame
      label="AI Productivity Suite · Project Management"
      rightSlot={
        <div className="flex items-center gap-1 text-indigo-300">
          <Users className="size-3.5" aria-hidden />
          <span className="text-xs font-medium">8 members</span>
        </div>
      }
    >
      <div className="border-b border-border bg-surface/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">July close</p>
            <p className="mt-0.5 text-[11px] text-foreground-subtle">
              9 of 13 tasks complete · 69%
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 text-[11px] font-medium text-indigo-200">
              <FolderKanban className="size-3" aria-hidden />
              Board
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-foreground-muted sm:inline-flex">
              <ListTodo className="size-3" aria-hidden />
              List
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-foreground-muted sm:inline-flex">
              <CalendarDays className="size-3" aria-hidden />
              Timeline
            </span>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full w-[69%] rounded-full bg-indigo-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 bg-surface/20 p-4 sm:grid-cols-3">
        {COLUMNS.map((column, columnIndex) => (
          <div key={column.title} className="rounded-xl border border-border bg-surface-muted/40 p-2.5">
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
                {column.title}
              </span>
              <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] text-foreground-subtle">
                {column.count}
              </span>
            </div>
            <div className="space-y-2">
              {column.tasks.map((task) => (
                <div
                  key={task.title}
                  className="rounded-lg border border-border bg-surface-raised p-2.5 shadow-sm"
                >
                  <div className="flex items-start gap-1.5">
                    {columnIndex === 2 && (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                    )}
                    <p className="text-xs font-medium leading-snug text-foreground">
                      {task.title}
                    </p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-[10px]',
                        task.meta === 'Today' ? 'font-medium text-amber-300' : 'text-foreground-subtle',
                      )}
                    >
                      {task.meta}
                    </span>
                    <div className="flex -space-x-1.5">
                      {task.avatars.map((initials) => (
                        <span
                          key={initials}
                          className="flex size-5 items-center justify-center rounded-full border border-surface bg-indigo-400/20 text-[8px] font-semibold text-indigo-200"
                        >
                          {initials}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-indigo-400/10 px-4 py-3 text-xs text-indigo-200">
        <Sparkles className="size-4 shrink-0 text-indigo-300" aria-hidden />
        <span>
          <strong className="font-semibold text-indigo-300">AI update:</strong>{' '}
          July close is on track. Two tasks need attention today.
        </span>
      </div>
    </BrowserFrame>
  )
}

export default function ProjectManagementShowcase() {
  return (
    <SectionShell
      id="productivity-suite-showcase"
      surface="tint"
      eyebrow="AI Productivity Suite"
      eyebrowIcon={FolderKanban}
      eyebrowTone={TONE}
      title={
        <>
          Professional work,{' '}
          <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', a.gradient)}>
            organized and accelerated
          </span>
        </>
      }
      description="Bring project management, team coordination, time tracking, forms, reporting, and AI assistance together in one connected workspace."
      media={<ProjectManagementMockup />}
    >
      <FeatureList items={HIGHLIGHTS} tone={TONE} className="pt-1" />
      <div className="pt-1">
        <Button
          asChild
          className="bg-accent-blue-500 text-white hover:bg-accent-blue-600"
        >
          <Link href="/dashboard/project-management">Open the AI Productivity Suite</Link>
        </Button>
      </div>
    </SectionShell>
  )
}
