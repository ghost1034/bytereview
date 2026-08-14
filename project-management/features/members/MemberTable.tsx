'use client'

/** Shared member directory table — workspace or team scope. */
import { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminOnlyWrap } from './AdminOnlyWrap'
import { InvitePeopleDialog } from './InvitePeopleDialog'
import { colorForUser } from '../../lib/colors'
import {
  canManageMembers,
  teamRoleForUser,
  workspaceRoleForUser,
  type MemberScope,
} from '../../lib/permissions'
import { formatDate } from '../../lib/time'
import type { Team, User, Workspace, WorkspaceInvitation } from '../../types'

export type MemberTableRow = {
  key: string
  user?: User
  email: string
  name: string
  role: 'admin' | 'member' | 'guest'
  joinedAt?: string
  pending: boolean
}

type Props = {
  scope: MemberScope
  currentUser: User | undefined
  users: User[]
  invitations?: WorkspaceInvitation[]
  teams?: Team[]
  rows: MemberTableRow[]
  onRoleChange: (key: string, role: 'admin' | 'member' | 'guest') => void
  onRemove: (keys: string[]) => void
  onRevokeInvite?: (invitationId: string) => void
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

function EmptyIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" aria-hidden className="mx-auto">
      <circle cx="40" cy="32" r="14" fill="hsl(var(--primary-soft))" />
      <circle cx="68" cy="28" r="11" fill="hsl(var(--surface-muted))" />
      <circle cx="88" cy="36" r="9" fill="hsl(var(--surface-muted))" />
      <rect x="20" y="52" width="80" height="8" rx="4" fill="hsl(var(--border))" />
      <rect x="32" y="66" width="56" height="6" rx="3" fill="hsl(var(--border))" opacity="0.6" />
    </svg>
  )
}

export function MemberTable({
  scope,
  currentUser,
  users,
  invitations = [],
  teams = [],
  rows,
  onRoleChange,
  onRemove,
  onRevokeInvite,
}: Props) {
  const canManage = Boolean(currentUser && canManageMembers(currentUser, scope))
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [bulkRole, setBulkRole] = useState<'admin' | 'member' | 'guest'>('member')

  const workspace = scope.type === 'workspace' ? scope.workspace : scope.workspace
  const workspaceId = workspace.id
  const workspaceName = workspace.name

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) return false
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (dateFilter === '30d' && row.joinedAt) {
        const days = (Date.now() - new Date(row.joinedAt).getTime()) / 86400000
        if (days > 30) return false
      }
      return true
    })
  }, [rows, search, roleFilter, dateFilter])

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.filter((r) => !r.pending).map((r) => r.key)) : new Set())
  }

  const toggleOne = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const applyBulkRole = () => {
    selected.forEach((key) => onRoleChange(key, bulkRole))
    setSelected(new Set())
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-col items-center gap-4 p-10 text-center shadow-sm">
        <EmptyIllustration />
        <p className="font-medium">No teammates yet</p>
        <AdminOnlyWrap allowed={canManage}>
          <Button className=" gap-2" disabled={!canManage} onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite teammates
          </Button>
        </AdminOnlyWrap>
        {currentUser && (
          <InvitePeopleDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            invitedById={currentUser.id}
            invitedByName={currentUser.name}
            teams={teams}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-input bg-background text-foreground max-w-xs"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Joined" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <AdminOnlyWrap allowed={canManage}>
          <Button className=" gap-2" disabled={!canManage} onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite people
          </Button>
        </AdminOnlyWrap>
      </div>

      {selected.size > 0 && canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
          <span className="text-sm">{selected.size} selected</span>
          <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as typeof bulkRole)}>
            <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void applyBulkRole()}>Change role</Button>
          <Button size="sm" variant="outline" onClick={() => { onRemove([...selected]); setSelected(new Set()) }}>
            Remove
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow style={{ background: 'hsl(var(--surface-muted))' }}>
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.filter((r) => !r.pending).length > 0 && selected.size === filtered.filter((r) => !r.pending).length}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {canManage && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.key}>
                {canManage && (
                  <TableCell>
                    {!row.pending && (
                      <Checkbox checked={selected.has(row.key)} onCheckedChange={(v) => toggleOne(row.key, Boolean(v))} />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.user ? (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback style={{ background: colorForUser(row.user.id), color: '#fff' }}>
                          {initials(row.name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback style={{ background: 'hsl(var(--surface-muted))' }}>?</AvatarFallback>
                      </Avatar>
                    )}
                    <span className="font-medium">{row.name}</span>
                    {row.pending && <Badge variant="secondary">Pending</Badge>}
                  </div>
                </TableCell>
                <TableCell style={{ color: 'hsl(var(--foreground-muted))' }}>{row.email}</TableCell>
                <TableCell className="capitalize">
                  {canManage && !row.pending ? (
                    <Select value={row.role} onValueChange={(v) => onRoleChange(row.key, v as typeof row.role)}>
                      <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[100]">
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="guest">Guest</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    row.pending ? `${row.role} (pending)` : row.role
                  )}
                </TableCell>
                <TableCell style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {row.joinedAt ? formatDate(row.joinedAt) : '—'}
                </TableCell>
                {canManage && (
                  <TableCell>
                    {row.pending ? (
                      onRevokeInvite && (
                        <Button size="sm" variant="outline" onClick={() => onRevokeInvite(row.key)}>Revoke</Button>
                      )
                    ) : (
                      row.key !== currentUser?.id && (
                        <Button size="sm" variant="outline" onClick={() => onRemove([row.key])}>Remove</Button>
                      )
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {currentUser && (
        <InvitePeopleDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          invitedById={currentUser.id}
          invitedByName={currentUser.name}
          teams={teams}
        />
      )}
    </div>
  )
}

/** Build workspace member rows including pending invitations. */
export function buildWorkspaceMemberRows(
  workspace: Workspace,
  users: User[],
  invitations: WorkspaceInvitation[]
): MemberTableRow[] {
  const memberRows = workspace.memberIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u))
    .map((user) => ({
      key: user.id,
      user,
      name: user.name,
      email: user.email,
      role: workspaceRoleForUser(user.id, workspace),
      joinedAt: user.createdAt,
      pending: false,
    }))
  const pendingRows = invitations
    .filter((inv) => inv.status === 'pending')
    .map((inv) => ({
      key: inv.id,
      email: inv.email,
      name: inv.email,
      role: inv.role,
      joinedAt: inv.createdAt,
      pending: true,
    }))
  return [...memberRows, ...pendingRows]
}

/** Build team member rows. */
export function buildTeamMemberRows(team: Team, users: User[]): MemberTableRow[] {
  return team.memberIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u))
    .map((user) => ({
      key: user.id,
      user,
      name: user.name,
      email: user.email,
      role: teamRoleForUser(user.id, team),
      joinedAt: user.createdAt,
      pending: false,
    }))
}
