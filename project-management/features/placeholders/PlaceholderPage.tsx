'use client'

/** Placeholder routes for Goals and Reporting (steps 23–26). */
import { usePageMeta } from '@/components/project management/hooks/usePageMeta'

export function PlaceholderPage({ title, step }: { title: string; step: string }) {
  usePageMeta({ breadcrumbs: [{ label: title }] })
  return (
    <div className="tl-card flex min-h-[280px] flex-col items-center justify-center p-8 text-center shadow-paper-sm">
      <h1 className="font-serif text-2xl">{title}</h1>
      <p className="mt-2 max-w-md text-sm" style={{ color: 'var(--ink-muted)' }}>
        Scaffold ready — full implementation lands in build step {step} per the Tasklytic plan.
      </p>
    </div>
  )
}
