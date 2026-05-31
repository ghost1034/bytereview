'use client'

import { Copy, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { Section } from '@/components/ui/section'
import {
  useAnalyticsFirm,
  useGenerateFirmInviteCode,
  useUpdateFirmMember,
} from '@/hooks/useAnalyticsTeam'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { isAdmin, settingsRoleLabel } from '@/lib/analytics/labels'
import type { AnalyticsFirmMember, AnalyticsUserRole } from '@/lib/analytics/types'

/** CPAAnalytics settings only distinguish Admin vs User. Map User to analyst in the API. */
function toSettingsRole(role: AnalyticsUserRole | undefined): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user'
}

function toApiRole(settingsRole: 'admin' | 'user'): AnalyticsUserRole {
  return settingsRole === 'admin' ? 'admin' : 'analyst'
}

function formatJoinedDate(value: string | undefined): string {
  if (!value) return 'Recently'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString()
}

export function FirmManagementTab() {
  const { user } = useAuth()
  const { data: firmData, isPending, isError, error, refetch } = useAnalyticsFirm()
  const updateMember = useUpdateFirmMember()
  const generateInviteCode = useGenerateFirmInviteCode()
  const { toast } = useToast()

  const firm = firmData?.firm
  const inviteCode = firmData?.invite_code ?? null
  const members = firmData?.members ?? []

  const currentRole = members.find((m) => m.user_id === user?.uid)?.role
  const admin = isAdmin(currentRole)

  const handleRoleChange = async (member: AnalyticsFirmMember, settingsRole: 'admin' | 'user') => {
    const newRole = toApiRole(settingsRole)
    if (member.role === newRole) return
    try {
      await updateMember.mutateAsync({ memberUserId: member.user_id, data: { role: newRole } })
      toast({
        title: 'Role updated',
        description: `${member.email} is now ${settingsRoleLabel(newRole)}.`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to change role.',
        variant: 'destructive',
      })
    }
  }

  const handleGenerateInviteCode = async () => {
    try {
      const result = await generateInviteCode.mutateAsync()
      toast({
        title: inviteCode ? 'Invitation code regenerated' : 'Invitation code generated',
        description: `Share code ${result.code} so colleagues can join your firm.`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to generate invitation code.',
        variant: 'destructive',
      })
    }
  }

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      toast({ title: 'Copied', description: 'Invitation code copied to clipboard.' })
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy the invitation code.',
        variant: 'destructive',
      })
    }
  }

  if (isPending) {
    return <LoadingState variant="page" label="Loading firm settings" />
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <p>{error instanceof Error ? error.message : 'Failed to load firm settings.'}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Section
        variant="card"
        title="Firm details"
        description="Basic information about your analytics firm."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted p-4">
            <p className="text-sm text-foreground-muted">Firm name</p>
            <p className="mt-1 font-semibold text-foreground">{firm?.name ?? 'Loading…'}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <p className="text-sm text-foreground-muted">Firm ID</p>
              <p className="mt-1 font-mono text-sm text-foreground">{firm?.id}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-foreground-muted">Invitation code</p>
                {admin && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={handleGenerateInviteCode}
                    disabled={generateInviteCode.isPending}
                  >
                    {generateInviteCode.isPending
                      ? 'Working…'
                      : inviteCode
                        ? 'Regenerate'
                        : 'Generate'}
                  </Button>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold tracking-widest text-foreground">
                  {inviteCode || 'Not generated'}
                </p>
                {inviteCode && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleCopyInviteCode}
                    aria-label="Copy invitation code"
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section variant="card" title="User management" description="People who belong to this firm.">
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-4 text-center text-sm text-foreground-muted">
              No users found for this firm.
            </p>
          ) : (
            members.map((member) => (
              <div
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{member.email}</p>
                  <p className="text-sm text-foreground-muted">
                    Joined {formatJoinedDate(member.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {admin && member.user_id !== user?.uid ? (
                    <select
                      value={toSettingsRole(member.role)}
                      onChange={(e) =>
                        handleRoleChange(member, e.target.value as 'admin' | 'user')
                      }
                      disabled={updateMember.isPending}
                      className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`Change role for ${member.email}`}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <Badge variant={isAdmin(member.role) ? 'default' : 'secondary'}>
                      {settingsRoleLabel(member.role)}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  )
}
