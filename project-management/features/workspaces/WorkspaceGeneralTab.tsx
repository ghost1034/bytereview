'use client'

/** Workspace settings — General tab (name, icon, domain, delete). */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AdminOnlyWrap } from '../members/AdminOnlyWrap'
import { EmojiPicker } from './EmojiPicker'
import { WorkspaceIcon } from './WorkspaceIcon'
import { deleteWorkspace } from '../../lib/workspaces/actions'
import { isWorkspaceAdmin } from '../../lib/permissions'
import type { User, Workspace } from '../../types'
import { useWorkspacesStore } from '../../stores/entities'

type Props = {
  workspace: Workspace
  currentUser: User | undefined
}

export function WorkspaceGeneralTab({ workspace, currentUser }: Props) {
  const router = useRouter()
  const canEdit = Boolean(currentUser && isWorkspaceAdmin(currentUser, workspace))
  const [name, setName] = useState(workspace.name)
  const [domain, setDomain] = useState(workspace.domain ?? '')
  const [iconEmoji, setIconEmoji] = useState(workspace.iconEmoji ?? '🏢')
  const [autoApprove, setAutoApprove] = useState(
    Boolean(workspace.settings?.autoApprovePrivateTeamJoinRequests)
  )
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      await useWorkspacesStore.getState().update(workspace.id, {
        name: name.trim(),
        domain: domain.trim() || undefined,
        iconEmoji,
        settings: { ...workspace.settings, autoApprovePrivateTeamJoinRequests: autoApprove },
      })
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (confirmName !== workspace.name) return
    await deleteWorkspace(workspace.id)
    setDeleteOpen(false)
    router.push('/dashboard/tasklytic')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <WorkspaceIcon name={name} emoji={iconEmoji} />
        <div>
          <h2 className="font-medium">General</h2>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Workspace identity and defaults</p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ws-name">Name</Label>
          <Input id="ws-name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ws-domain">Domain (informational)</Label>
          <Input id="ws-domain" value={domain} disabled={!canEdit} placeholder="acme.com" onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Icon</Label>
          {canEdit ? <EmojiPicker value={iconEmoji} onChange={setIconEmoji} /> : <span className="text-2xl">{iconEmoji}</span>}
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <p className="text-sm font-medium">Auto-approve private team join requests</p>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Skip admin review for private teams</p>
          </div>
          <Switch checked={autoApprove} disabled={!canEdit} onCheckedChange={setAutoApprove} />
        </div>
        <AdminOnlyWrap allowed={canEdit}>
          <Button className="tl-btn-primary w-fit" disabled={!canEdit || saving || !name.trim()} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </AdminOnlyWrap>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft, #fef2f2)' }}>
        <p className="font-medium text-sm" style={{ color: 'var(--danger)' }}>Danger zone</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>Permanently delete this workspace and all teams/projects.</p>
        <AdminOnlyWrap allowed={canEdit}>
          <Button variant="outline" className="mt-3" disabled={!canEdit} onClick={() => setDeleteOpen(true)}>Delete workspace</Button>
        </AdminOnlyWrap>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="tl-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              Type <strong>{workspace.name}</strong> to confirm. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={workspace.name} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={confirmName !== workspace.name} onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
