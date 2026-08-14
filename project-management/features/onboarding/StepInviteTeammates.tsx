'use client'

import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

type Props = {
  emails: string
  onEmailsChange: (v: string) => void
  role: 'member' | 'admin' | 'guest'
  onRoleChange: (v: 'member' | 'admin' | 'guest') => void
  note: string
  onNoteChange: (v: string) => void
}

export function StepInviteTeammates({
  emails,
  onEmailsChange,
  role,
  onRoleChange,
  note,
  onNoteChange,
}: Props) {
  const serverMode = usesTasklyticBackend()
  return (
    <div className="grid gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {serverMode
          ? 'Paste emails separated by commas or new lines. We’ll email each person a link to join your workspace.'
          : 'Paste emails separated by commas or new lines. Invites are queued locally (Settings → Pending Emails) until an email provider is connected.'}
      </p>
      <div className="grid gap-2">
        <Label htmlFor="invite-emails">Email addresses</Label>
        <textarea
          id="invite-emails"
          value={emails}
          onChange={(e) => onEmailsChange(e.target.value)}
          placeholder="alex@company.com, sam@company.com"
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm tl-input"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        />
      </div>
      <div className="grid gap-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => onRoleChange(v as Props['role'])}>
          <SelectTrigger className="tl-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-note">Personal note (optional)</Label>
        <Input
          id="invite-note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Join us in the CPAAutomation Tasklytic!"
          className="tl-input"
        />
      </div>
    </div>
  )
}
