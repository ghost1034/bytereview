'use client'

/** Editorial empty state for reporting home. */
import { BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { onCreate: () => void }

/** Warm-themed CTA when no dashboards exist. */
export function ReportingEmptyState({ onCreate }: Props) {
  return (
    <div
      className="rounded-lg border border-border bg-card text-card-foreground flex flex-col items-center justify-center px-8 py-16 text-center shadow-sm"
     
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'hsl(var(--primary-soft))' }}
      >
        <BarChart3 className="h-7 w-7" style={{ color: 'hsl(var(--primary))' }} />
      </div>
      <h2 className="font-sans text-xl">See the story in your work</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Universal reporting turns tasks, projects, portfolios, and goals into living dashboards. Start with a template or build charts from scratch.
      </p>
      <Button className=" mt-6 border-0" onClick={onCreate}>
        Create your first dashboard
      </Button>
    </div>
  )
}
