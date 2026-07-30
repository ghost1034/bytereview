'use client'

/** Step 1 — editorial welcome screen. */
import { Button } from '@/components/ui/button'

type Props = {
  onContinue: () => void
}

export function StepWelcome({ onContinue }: Props) {
  return (
    <div className="space-y-6 py-4 text-center">
      <h2 className="font-serif text-2xl italic text-foreground">
        Welcome to Tasklytic.
      </h2>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
        A modern home for projects, goals, and the people who deliver them. Let&apos;s set up your workspace in
        under a minute.
      </p>
      <Button className="border-0 bg-[#cc785c] text-white hover:bg-[#b05d40]" onClick={onContinue}>
        Get started
      </Button>
    </div>
  )
}
