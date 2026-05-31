'use client'

import { useState } from 'react'
import { ArrowRight, Building, Key, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCreateAnalyticsFirm,
  useJoinAnalyticsFirm,
} from '@/hooks/useAnalyticsTeam'

type OnboardingMode = 'select' | 'create' | 'join'

export function AnalyticsOnboarding() {
  const { signOut } = useAuth()
  const createFirm = useCreateAnalyticsFirm()
  const joinFirm = useJoinAnalyticsFirm()

  const [mode, setMode] = useState<OnboardingMode>('select')
  const [firmName, setFirmName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')

  const loading = createFirm.isPending || joinFirm.isPending

  const handleCreateFirm = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = firmName.trim()
    if (!name) return
    setError('')

    try {
      await createFirm.mutateAsync({ name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create firm.')
    }
  }

  const handleJoinFirm = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) return
    setError('')

    try {
      await joinFirm.mutateAsync({ code })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join firm.')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Building className="size-8 text-primary-foreground" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to CPA Analytics</h1>
          <p className="mt-2 text-sm text-foreground-muted">Set up your firm to get started.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            {error}
          </div>
        )}

        {mode === 'select' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="group flex w-full items-center justify-between rounded-xl border-2 border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building className="size-5" aria-hidden />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Create a new firm</h3>
                  <p className="text-sm text-foreground-muted">I&apos;m setting up a new organization</p>
                </div>
              </div>
              <ArrowRight
                className="size-5 text-foreground-subtle group-hover:text-primary"
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={() => setMode('join')}
              className="group flex w-full items-center justify-between rounded-xl border-2 border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Key className="size-5" aria-hidden />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground">Join existing firm</h3>
                  <p className="text-sm text-foreground-muted">I have an invitation code</p>
                </div>
              </div>
              <ArrowRight
                className="size-5 text-foreground-subtle group-hover:text-primary"
                aria-hidden
              />
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreateFirm} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="firm-name">Firm name</Label>
              <Input
                id="firm-name"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="e.g. Acme Corp"
                required
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setMode('select')}
                disabled={loading}
              >
                Back
              </Button>
              <Button type="submit" className="flex-[2]" disabled={loading || !firmName.trim()}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                Create firm
              </Button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoinFirm} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invitation code</Label>
              <Input
                id="invite-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3"
                className="font-mono uppercase tracking-widest"
                required
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setMode('select')}
                disabled={loading}
              >
                Back
              </Button>
              <Button type="submit" className="flex-[2]" disabled={loading || !inviteCode.trim()}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                Join firm
              </Button>
            </div>
          </form>
        )}

        <div className="mt-8 border-t border-border pt-6 text-center">
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsOnboarding
