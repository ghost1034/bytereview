'use client'

/** Multi-email workspace invite dialog with per-recipient results. */
import { useState } from 'react'
import { Mail } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { parseInviteEmails, sendWorkspaceInvites, type InviteResult } from '../../lib/invites'
import type { Team, WorkspaceInvitation } from '../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  invitedById: string
  invitedByName: string
  teams?: Team[]
}

export function InvitePeopleDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  invitedById,
  invitedByName,
  teams = [],
}: Props) {
  const [emailsRaw, setEmailsRaw] = useState('')
  const [role, setRole] = useState<WorkspaceInvitation['role']>('member')
  const [teamId, setTeamId] = useState<string>('none')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<InviteResult[]>([])

  const reset = () => {
    setEmailsRaw('')
    setRole('member')
    setTeamId('none')
    setNote('')
    setResults([])
  }

  const submit = async () => {
    const emails = parseInviteEmails(emailsRaw)
    if (emails.length === 0) return
    setLoading(true)
    try {
      const summary = await sendWorkspaceInvites({
        workspaceId,
        workspaceName,
        emails,
        role,
        invitedById,
        invitedByName,
        note,
        teamId: teamId === 'none' ? undefined : teamId,
      })
      setResults(summary)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">Invite people</DialogTitle>
        </DialogHeader>
        {results.length > 0 ? (
          <ul className="space-y-2 py-2">
            {results.map((row) => (
              <li key={row.email} className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 shrink-0" style={{ color: row.ok ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }} />
                <span className="min-w-0 flex-1 truncate">{row.email}</span>
                <span style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {row.ok
                    ? row.emailSent
                      ? 'Email sent'
                      : 'Queued locally'
                    : row.error}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="invite-emails">Email addresses</Label>
              <Textarea
                id="invite-emails"
                placeholder="name@company.com, teammate@company.com"
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as WorkspaceInvitation['role'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {teams.length > 0 && (
              <div className="grid gap-2">
                <Label>Starting team (optional)</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="none">None</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="invite-note">Personal note (optional)</Label>
              <Input id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          {results.length > 0 ? (
            <Button className="" onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="" disabled={loading || !emailsRaw.trim()} onClick={() => void submit()}>
                {loading ? 'Sending…' : 'Send invites'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
