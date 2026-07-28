'use client'

/** Editorial empty state for the goals home. */
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  tabLabel: string
  onCreate: () => void
}

/** Warm-themed empty state with create CTA. */
export function GoalsEmptyState({ tabLabel, onCreate }: Props) {
  return (
    <div
      className="tl-card flex flex-col items-center justify-center px-8 py-16 text-center shadow-paper-sm"
     
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--primary-soft)' }}
      >
        <Target className="h-7 w-7" style={{ color: 'var(--primary)' }} />
      </div>
      <h2 className="font-serif text-xl">Set a direction worth pursuing</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {tabLabel === 'My goals'
          ? 'Goals turn ambition into measurable progress. Create your first OKR and link the projects that will get you there.'
          : `No goals in ${tabLabel.toLowerCase()} yet. When your team publishes objectives, they will appear here.`}
      </p>
      {tabLabel === 'My goals' ? (
        <Button className="tl-btn-primary mt-6 border-0" onClick={onCreate}>
          Create your first goal
        </Button>
      ) : null}
    </div>
  )
}
