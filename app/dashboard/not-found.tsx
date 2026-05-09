import Link from 'next/link'
import { ArrowLeft, Compass } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-surface-raised p-8 text-center shadow-sm">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-primary-soft ring-1 ring-primary/15"
          aria-hidden
        >
          <Compass className="size-5 text-primary-soft-foreground" />
        </span>
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
            404 — Not found
          </p>
          <h1 className="text-lg font-semibold text-foreground">
            We couldn&apos;t find that page
          </h1>
          <p className="text-sm text-foreground-muted">
            The page you&apos;re looking for may have been moved or doesn&apos;t
            exist. Try jumping back to the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden />
              Back to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/jobs">View jobs</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
