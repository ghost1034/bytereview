'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-surface-raised p-8 text-center shadow-sm">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-destructive-soft ring-1 ring-destructive/20"
          aria-hidden
        >
          <AlertTriangle className="size-5 text-destructive" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-foreground-muted">
            We hit an unexpected error loading this page. The team has been
            notified — please try again, or head back to your dashboard.
          </p>
          {error.digest && (
            <p className="pt-2 text-xs text-foreground-subtle">
              Error reference: <code className="font-mono">{error.digest}</code>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCcw className="mr-1.5 size-4" aria-hidden />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
