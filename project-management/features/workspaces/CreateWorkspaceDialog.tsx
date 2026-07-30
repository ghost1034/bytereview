'use client'

/**
 * CreateWorkspaceDialog — multi-step workspace creation with optional teammate invites.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmojiPicker } from './EmojiPicker'
import { parseInviteEmails, sendWorkspaceInvites } from '../../lib/invites'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { DEFAULT_FREE_PLAN } from '../../lib/workspaces/defaults'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { useTeamsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWorkspaceDialog({ open, onOpenChange }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const setActiveWorkspaceId = useUiStore((s) => s.setActiveWorkspaceId)
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [iconEmoji, setIconEmoji] = useState('🏢')
  const [inviteEmails, setInviteEmails] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setStep(1)
    setName('')
    setDomain('')
    setIconEmoji('🏢')
    setInviteEmails('')
  }

  const create = async () => {
    if (!currentUserId || !name.trim()) return
    setLoading(true)
    try {
      const workspaceId = newId()
      const teamId = newId()
      await useWorkspacesStore.getState().add({
        id: workspaceId,
        name: name.trim(),
        domain: domain.trim() || undefined,
        iconEmoji,
        memberIds: [currentUserId],
        adminIds: [currentUserId],
        plan: DEFAULT_FREE_PLAN,
        createdAt: now(),
      })
      await useTeamsStore.getState().add({
        id: teamId,
        workspaceId,
        name: 'General',
        iconEmoji: '👥',
        memberIds: [currentUserId],
        adminIds: [currentUserId],
        privacy: 'public',
      })

      const emails = parseInviteEmails(inviteEmails)
      if (emails.length > 0 && currentUser) {
        await sendWorkspaceInvites({
          workspaceId,
          workspaceName: name.trim(),
          emails,
          role: 'member',
          invitedById: currentUserId,
          invitedByName: currentUser.name,
        })
      }

      setActiveWorkspaceId(workspaceId)
      onOpenChange(false)
      reset()
      router.push(`/dashboard/project-management/w/${workspaceId}/home`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset() }}>
      <DialogContent className="tl-dialog-surface max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Create workspace</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className="tl-input" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ws-domain">Domain (optional)</Label>
              <Input id="ws-domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Icon</Label>
              <EmojiPicker value={iconEmoji} onChange={setIconEmoji} />
            </div>
          </div>
        ) : (
          <div className="grid gap-2 py-2">
            <Label htmlFor="ws-invites">Invite teammates (optional)</Label>
            <Textarea
              id="ws-invites"
              placeholder="One email per line or comma-separated"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              rows={5}
            />
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Invites queue to Pending Emails until an email provider is configured.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="tl-btn-primary" disabled={!name.trim()} onClick={() => setStep(2)}>Next</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button variant="ghost" onClick={() => void create()} disabled={loading}>Skip invites</Button>
              <Button className="tl-btn-primary" disabled={loading} onClick={() => void create()}>
                {loading ? 'Creating…' : 'Create workspace'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
