'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useUpdateFirmMember } from '@/hooks/useAnalyticsTeam'
import {
  USER_PERSONA_LABELS,
  USER_PERSONA_OPTIONS,
  USER_ROLE_LABELS,
  USER_ROLE_OPTIONS,
} from '@/lib/analytics/labels'
import type {
  AnalyticsFirmMember,
  AnalyticsUserPersona,
  AnalyticsUserRole,
} from '@/lib/analytics/types'

const NO_PERSONA = '__none__'

interface MemberEditDialogProps {
  isOpen: boolean
  onClose: () => void
  member: AnalyticsFirmMember | null
}

export function MemberEditDialog({ isOpen, onClose, member }: MemberEditDialogProps) {
  const [role, setRole] = useState<AnalyticsUserRole>('analyst')
  const [persona, setPersona] = useState<string>(NO_PERSONA)
  const [title, setTitle] = useState('')

  const { toast } = useToast()
  const updateMutation = useUpdateFirmMember()

  useEffect(() => {
    if (!isOpen || !member) return
    setRole(member.role ?? 'analyst')
    setPersona(member.persona ?? NO_PERSONA)
    setTitle(member.title ?? '')
  }, [isOpen, member])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return

    try {
      await updateMutation.mutateAsync({
        memberUserId: member.user_id,
        data: {
          role,
          persona: persona === NO_PERSONA ? null : (persona as AnalyticsUserPersona),
          title: title.trim() || null,
        },
      })
      toast({
        title: 'Member updated',
        description: `${member.display_name || member.email} has been updated.`,
      })
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update member.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>
            {member?.display_name || member?.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AnalyticsUserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Persona</Label>
            <Select value={persona} onValueChange={setPersona}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PERSONA}>None</SelectItem>
                {USER_PERSONA_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {USER_PERSONA_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-title">Title</Label>
            <Input
              id="member-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Accountant"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default MemberEditDialog
