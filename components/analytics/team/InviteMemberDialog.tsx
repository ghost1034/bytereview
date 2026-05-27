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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useInviteFirmMember } from '@/hooks/useAnalyticsTeam'

interface InviteMemberDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function InviteMemberDialog({ isOpen, onClose }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('')
  const { toast } = useToast()
  const inviteMutation = useInviteFirmMember()

  useEffect(() => {
    if (isOpen) setEmail('')
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      toast({
        title: 'Validation error',
        description: 'Enter an email address.',
        variant: 'destructive',
      })
      return
    }

    try {
      // The endpoint adds an *existing* CPAAutomation user to the firm. It
      // returns null when no account matches the email.
      const member = await inviteMutation.mutateAsync({ email: trimmed })
      if (member) {
        toast({ title: 'Member added', description: `${trimmed} was added to your firm.` })
        onClose()
      } else {
        toast({
          title: 'No matching user',
          description: `No CPAAutomation account exists for ${trimmed}. Ask them to sign up first.`,
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add member.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            Add an existing CPAAutomation user to your firm by their email address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@firm.com"
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              )}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InviteMemberDialog
