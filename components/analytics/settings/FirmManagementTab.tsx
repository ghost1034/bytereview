'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, Pencil, Trash2, UserPlus, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { Section } from '@/components/ui/section'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { InviteMemberDialog } from '@/components/analytics/team/InviteMemberDialog'
import { MemberEditDialog } from '@/components/analytics/team/MemberEditDialog'
import {
  useAnalyticsFirm,
  useRemoveFirmMember,
  useUpdateFirm,
  useUpdateFirmMember,
} from '@/hooks/useAnalyticsTeam'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import {
  isAdmin,
  USER_PERSONA_LABELS,
  USER_ROLE_LABELS,
  USER_ROLE_OPTIONS,
} from '@/lib/analytics/labels'
import type {
  AnalyticsFirmMember,
  AnalyticsUserPersona,
  AnalyticsUserRole,
} from '@/lib/analytics/types'

type MemberRow = AnalyticsFirmMember & { id: string }

function initials(member: AnalyticsFirmMember): string {
  const source = member.display_name || member.email || '?'
  const parts = source.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function FirmManagementTab() {
  const { user } = useAuth()
  const { data: firmData, isLoading } = useAnalyticsFirm()
  const updateFirm = useUpdateFirm()
  const updateMember = useUpdateFirmMember()
  const removeMember = useRemoveFirmMember()
  const { toast } = useToast()

  const firm = firmData?.firm
  const members = useMemo<MemberRow[]>(
    () => (firmData?.members ?? []).map((m) => ({ ...m, id: m.user_id })),
    [firmData],
  )

  const currentRole = members.find((m) => m.user_id === user?.uid)?.role
  const admin = isAdmin(currentRole)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<AnalyticsFirmMember | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null)

  const [renaming, setRenaming] = useState(false)
  const [firmName, setFirmName] = useState('')

  const startRename = () => {
    setFirmName(firm?.name ?? '')
    setRenaming(true)
  }

  const saveRename = async () => {
    const name = firmName.trim()
    if (!name) return
    try {
      await updateFirm.mutateAsync({ name })
      toast({ title: 'Firm renamed', description: `Firm name updated to ${name}.` })
      setRenaming(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to rename firm.',
        variant: 'destructive',
      })
    }
  }

  const handleRoleChange = async (row: MemberRow, newRole: AnalyticsUserRole) => {
    if (row.role === newRole) return
    try {
      await updateMember.mutateAsync({ memberUserId: row.user_id, data: { role: newRole } })
      toast({
        title: 'Role updated',
        description: `${row.display_name || row.email} is now ${USER_ROLE_LABELS[newRole]}.`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to change role.',
        variant: 'destructive',
      })
    }
  }

  const confirmRemove = async () => {
    if (!memberToRemove) return
    try {
      await removeMember.mutateAsync(memberToRemove.user_id)
      toast({
        title: 'Member removed',
        description: `${memberToRemove.display_name || memberToRemove.email} was removed from the firm.`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member.',
        variant: 'destructive',
      })
    } finally {
      setMemberToRemove(null)
    }
  }

  const columns: ColumnDef<MemberRow>[] = [
    {
      header: 'Member',
      accessorKey: 'display_name',
      sortable: true,
      cell: (_value, row) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback>{initials(row)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-semibold text-foreground">
              {row.display_name || row.email}
            </div>
            <div className="text-xs text-foreground-muted">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Persona / title',
      accessorKey: 'persona',
      cell: (_value, row) => (
        <div className="space-y-0.5 text-sm">
          <div className="text-foreground">
            {row.persona
              ? USER_PERSONA_LABELS[row.persona as AnalyticsUserPersona]
              : '—'}
          </div>
          {row.title && <div className="text-xs text-foreground-muted">{row.title}</div>}
        </div>
      ),
    },
    {
      header: 'Role',
      accessorKey: 'role',
      sortable: true,
      cell: (value, row) => {
        const role = (value as AnalyticsUserRole) ?? 'analyst'
        if (admin && row.user_id !== user?.uid) {
          return (
            <select
              value={role}
              onChange={(e) => handleRoleChange(row, e.target.value as AnalyticsUserRole)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              aria-label={`Change role for ${row.display_name || row.email}`}
            >
              {USER_ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {USER_ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          )
        }
        return <Badge variant="secondary">{USER_ROLE_LABELS[role]}</Badge>
      },
    },
    {
      header: 'Status',
      accessorKey: 'created_at',
      cell: () => (
        <Badge className="border-success/20 bg-success-soft text-success">Active</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {firm && (
        <Section variant="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                Firm
              </p>
              {renaming ? (
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={firmName}
                    onChange={(e) => setFirmName(e.target.value)}
                    className="h-9 w-64"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={saveRename}
                    disabled={updateFirm.isPending}
                    aria-label="Save firm name"
                  >
                    {updateFirm.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setRenaming(false)}
                    aria-label="Cancel rename"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">{firm.name}</h2>
                  {admin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={startRename}
                      aria-label="Rename firm"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              )}
              <p className="mt-2 font-mono text-xs text-foreground-subtle">{firm.id}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-foreground-muted">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>
              {admin && (
                <Button onClick={() => setInviteOpen(true)}>
                  <UserPlus className="mr-1.5 size-4" aria-hidden />
                  Add member
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}

      {isLoading ? (
        <LoadingState variant="table" label="Loading team" />
      ) : (
        <DataTable
          data={members}
          columns={columns}
          searchPlaceholder="Search members…"
          rowActions={
            admin
              ? (row) => (
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${row.display_name || row.email}`}
                      onClick={() => setEditingMember(row)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.display_name || row.email}`}
                      disabled={row.user_id === user?.uid}
                      onClick={() => setMemberToRemove(row)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                )
              : undefined
          }
        />
      )}

      <InviteMemberDialog isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />

      <MemberEditDialog
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        member={editingMember}
      />

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {memberToRemove?.display_name || memberToRemove?.email} from the firm? They
              will lose access to its analytics data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Removing…
                </>
              ) : (
                'Remove member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
