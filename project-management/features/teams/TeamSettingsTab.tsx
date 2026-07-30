'use client'

/** Team settings tab — edit team and manage members. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AdminOnlyWrap } from '../members/AdminOnlyWrap'
import { buildTeamMemberRows, MemberTable } from '../members/MemberTable'
import { EmojiPicker } from '../workspaces/EmojiPicker'
import { canManageMembers } from '../../lib/permissions'
import type { Team, User, Workspace } from '../../types'
import { useTeamsStore, useUsersStore } from '../../stores/entities'

type Props = {
  team: Team
  workspace: Workspace
  currentUser: User | undefined
}

export function TeamSettingsTab({ team, workspace, currentUser }: Props) {
  const canEdit = Boolean(currentUser && canManageMembers(currentUser, { type: 'team', workspace, team }))
  const users = useUsersStore((s) => s.list())
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? '')
  const [iconEmoji, setIconEmoji] = useState(team.iconEmoji ?? '👥')
  const [privacy, setPrivacy] = useState(team.privacy)
  const [saving, setSaving] = useState(false)
  const rows = buildTeamMemberRows(team, users)

  const save = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      await useTeamsStore.getState().update(team.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        iconEmoji,
        privacy,
      })
    } finally {
      setSaving(false)
    }
  }

  const setTeamRole = async (userId: string, role: 'admin' | 'member' | 'guest') => {
    const adminIds = (team.adminIds ?? []).filter((id) => id !== userId)
    const guestIds = (team.guestIds ?? []).filter((id) => id !== userId)
    let nextAdmin = [...adminIds]
    let nextGuest = [...guestIds]
    if (role === 'admin') nextAdmin = [...nextAdmin, userId]
    if (role === 'guest') nextGuest = [...nextGuest, userId]
    await useTeamsStore.getState().update(team.id, { adminIds: nextAdmin, guestIds: nextGuest })
  }

  const removeMembers = async (keys: string[]) => {
    await useTeamsStore.getState().update(team.id, {
      memberIds: team.memberIds.filter((id) => !keys.includes(id)),
      adminIds: (team.adminIds ?? []).filter((id) => !keys.includes(id)),
      guestIds: (team.guestIds ?? []).filter((id) => !keys.includes(id)),
    })
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-xl grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="team-name">Name</Label>
          <Input id="team-name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="team-desc">Description</Label>
          <Textarea id="team-desc" value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="grid gap-2">
          <Label>Icon</Label>
          {canEdit ? <EmojiPicker value={iconEmoji} onChange={setIconEmoji} size="sm" /> : <span>{iconEmoji}</span>}
        </div>
        <div className="grid gap-2">
          <Label>Privacy</Label>
          <Select value={privacy} disabled={!canEdit} onValueChange={(v) => setPrivacy(v as Team['privacy'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="secret">Secret</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AdminOnlyWrap allowed={canEdit}>
          <Button className="tl-btn-primary w-fit" disabled={!canEdit || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </AdminOnlyWrap>
      </div>

      <div>
        <h3 className="mb-3 font-medium">Team members</h3>
        <MemberTable
          scope={{ type: 'team', workspace, team }}
          currentUser={currentUser}
          users={users}
          rows={rows}
          onRoleChange={(key, role) => void setTeamRole(key, role)}
          onRemove={(keys) => void removeMembers(keys)}
        />
      </div>
    </div>
  )
}
