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
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { InviteMemberDialog } from '@/components/analytics/team/InviteMemberDialog'
import { MemberEditDialog } from '@/components/analytics/team/MemberEditDialog'
import {
  PERSONA_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLE_DEFINITION_BY_KEY,
} from '@/components/analytics/team/teamReference'
import { cn } from '@/lib/utils'
import {
  useAnalyticsFirm,
  useRemoveFirmMember,
  useUpdateFirm,
} from '@/hooks/useAnalyticsTeam'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { isAdmin, USER_PERSONA_LABELS, USER_ROLE_LABELS } from '@/lib/analytics/labels'
import { AI_CONTEXT_MAX_ITEMS, useAIContext, type TeamContext } from '@/lib/analytics/aiContext'
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

export default function AnalyticsTeamPage() {
  const { user } = useAuth()
  const { data: firmData, isLoading } = useAnalyticsFirm()
  const updateFirm = useUpdateFirm()
  const removeMember = useRemoveFirmMember()
  const { toast } = useToast()

  const firm = firmData?.firm
  const members = useMemo<MemberRow[]>(
    () => (firmData?.members ?? []).map((m) => ({ ...m, id: m.user_id })),
    [firmData],
  )

  const currentRole = members.find((m) => m.user_id === user?.uid)?.role
  const admin = isAdmin(currentRole)

  // Publish a compact roster to the floating AI Assistant.
  const aiContext = useMemo<TeamContext>(
    () => ({
      team: {
        count: firmData?.members?.length ?? 0,
        members: (firmData?.members ?? []).slice(0, AI_CONTEXT_MAX_ITEMS).map((m) => ({
          name: m.display_name || m.email,
          email: m.email,
          role: m.role,
          persona: m.persona,
        })),
      },
    }),
    [firmData],
  )
  useAIContext(aiContext)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<AnalyticsFirmMember | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null)

  // Inline firm rename
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
      cell: (value) => {
        const def = ROLE_DEFINITION_BY_KEY[value as AnalyticsUserRole]
        const Icon = def?.icon
        return (
          <Badge variant="secondary" className="gap-1.5">
            {Icon && <Icon className={cn('size-3', def.iconClass)} aria-hidden />}
            {def?.label ?? USER_ROLE_LABELS[value as AnalyticsUserRole] ?? value}
          </Badge>
        )
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
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Manage who can access your firm’s analytics, and review roles and personas."
        actions={
          admin ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-1.5 size-4" aria-hidden />
              Add member
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList>
          <TabsTrigger value="members">Team members</TabsTrigger>
          <TabsTrigger value="roles">Roles &amp; permissions</TabsTrigger>
          <TabsTrigger value="personas">Target personas</TabsTrigger>
        </TabsList>

        {/* --- Members --- */}
        <TabsContent value="members" className="space-y-6">
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
                </div>
                <p className="text-sm text-foreground-muted">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </p>
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
        </TabsContent>

        {/* --- Roles & permissions --- */}
        <TabsContent value="roles">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ROLE_DEFINITIONS.map((role) => {
              const Icon = role.icon
              return (
                <Card key={role.role} className="p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex size-10 items-center justify-center rounded-xl',
                        role.iconBgClass,
                      )}
                    >
                      <Icon className={cn('size-5', role.iconClass)} aria-hidden />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{role.label}</h3>
                  </div>
                  <p className="mt-2 text-sm text-foreground-muted">{role.description}</p>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* --- Target personas --- */}
        <TabsContent value="personas">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PERSONA_DEFINITIONS.map((persona) => (
              <Card key={persona.persona} className="p-5">
                <h3 className="text-base font-semibold text-foreground">{persona.label}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                      Focus
                    </dt>
                    <dd className="text-foreground-muted">{persona.focus}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                      Needs
                    </dt>
                    <dd className="text-foreground-muted">{persona.needs}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
