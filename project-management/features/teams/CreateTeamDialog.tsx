'use client'

/** Create team dialog — name, description, emoji, privacy. */
import { useState } from 'react'
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
import { EmojiPicker } from '../workspaces/EmojiPicker'
import { newId } from '../../lib/ids'
import { useTeamsStore } from '../../stores/entities'
import type { Team } from '../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  currentUserId: string
  onCreated?: (teamId: string) => void
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  currentUserId,
  onCreated,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [iconEmoji, setIconEmoji] = useState('👥')
  const [privacy, setPrivacy] = useState<Team['privacy']>('public')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setName('')
    setDescription('')
    setIconEmoji('👥')
    setPrivacy('public')
  }

  const create = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const id = newId()
      await useTeamsStore.getState().add({
        id,
        workspaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        iconEmoji,
        memberIds: [currentUserId],
        adminIds: [currentUserId],
        pinnedProjectIds: [],
        privacy,
      })
      onOpenChange(false)
      reset()
      onCreated?.(id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">Create team</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} className="tl-input" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="team-desc">Description</Label>
            <Textarea id="team-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-2">
            <Label>Icon</Label>
            <EmojiPicker value={iconEmoji} onChange={setIconEmoji} size="sm" />
          </div>
          <div className="grid gap-2">
            <Label>Privacy</Label>
            <Select value={privacy} onValueChange={(v) => setPrivacy(v as Team['privacy'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="public">Public — anyone can join</SelectItem>
                <SelectItem value="private">Private — request to join</SelectItem>
                <SelectItem value="secret">Secret — hidden from non-members</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary" disabled={!name.trim() || loading} onClick={() => void create()}>
            {loading ? 'Creating…' : 'Create team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
