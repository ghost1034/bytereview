'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { acceptWorkspaceInvite } from './lib/invites/acceptInvite'

export function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('This invitation link is missing its token.')
      return
    }
    let cancelled = false
    void acceptWorkspaceInvite(token)
      .then(({ workspaceId }) => {
        if (cancelled) return
        setAccepted(true)
        window.setTimeout(() => {
          router.replace(`/dashboard/project-management/w/${workspaceId}/home`)
        }, 900)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The invitation could not be accepted.')
      })
    return () => {
      cancelled = true
    }
  }, [router, token])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="rounded-lg border border-border bg-card text-card-foreground w-full max-w-md p-8 text-center shadow-md">
        {error ? (
          <>
            <XCircle className="mx-auto h-10 w-10" style={{ color: 'hsl(var(--destructive))' }} />
            <h1 className="mt-4 font-sans text-2xl">Invitation unavailable</h1>
            <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{error}</p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/dashboard/project-management">Tasklytic home</Link>
            </Button>
          </>
        ) : accepted ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: 'hsl(var(--success))' }} />
            <h1 className="mt-4 font-sans text-2xl">Invitation accepted</h1>
            <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Opening your workspace…</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            <h1 className="mt-4 font-sans text-2xl">Joining workspace</h1>
            <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Checking your invitation…</p>
          </>
        )}
      </div>
    </div>
  )
}
