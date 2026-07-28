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
      <div className="tl-card w-full max-w-md p-8 text-center shadow-paper-md">
        {error ? (
          <>
            <XCircle className="mx-auto h-10 w-10" style={{ color: 'var(--danger)' }} />
            <h1 className="mt-4 font-serif text-2xl">Invitation unavailable</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>{error}</p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/dashboard/project-management">Project Management home</Link>
            </Button>
          </>
        ) : accepted ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: 'var(--accent)' }} />
            <h1 className="mt-4 font-serif text-2xl">Invitation accepted</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>Opening your workspace…</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: 'var(--primary)' }} />
            <h1 className="mt-4 font-serif text-2xl">Joining workspace</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>Checking your invitation…</p>
          </>
        )}
      </div>
    </div>
  )
}
