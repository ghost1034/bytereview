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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useCreateAnalyticsClient,
  useUpdateAnalyticsClient,
} from '@/hooks/useAnalyticsClients'
import type { AnalyticsClient } from '@/lib/analytics/types'

interface ClientModalProps {
  isOpen: boolean
  onClose: () => void
  client?: AnalyticsClient | null
}

export function ClientModal({ isOpen, onClose, client }: ClientModalProps) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [fiscalYearEnd, setFiscalYearEnd] = useState('')
  const [notes, setNotes] = useState('')

  const { toast } = useToast()
  const createMutation = useCreateAnalyticsClient()
  const updateMutation = useUpdateAnalyticsClient()
  const isSaving = createMutation.isPending || updateMutation.isPending

  // Reset the form whenever the modal opens (for the relevant client).
  useEffect(() => {
    if (!isOpen) return
    setName(client?.name ?? '')
    setIndustry(client?.industry ?? '')
    setContactName(client?.contact_name ?? '')
    setContactEmail(client?.contact_email ?? '')
    setContactPhone(client?.contact_phone ?? '')
    setFiscalYearEnd(client?.fiscal_year_end ?? '')
    setNotes(client?.notes ?? '')
  }, [isOpen, client])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Client name is required.',
        variant: 'destructive',
      })
      return
    }

    const payload = {
      name: name.trim(),
      industry: industry.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      fiscal_year_end: fiscalYearEnd.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    try {
      if (client) {
        await updateMutation.mutateAsync({ clientId: client.id, data: payload })
        toast({ title: 'Client updated', description: `${payload.name} has been updated.` })
      } else {
        await createMutation.mutateAsync(payload)
        toast({ title: 'Client added', description: `${payload.name} has been added.` })
      }
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save client.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'Add client'}</DialogTitle>
          <DialogDescription>
            {client
              ? 'Update this client’s details.'
              : 'Create a new client for your firm.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Company name *</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-industry">Industry</Label>
              <Input
                id="client-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Manufacturing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-fye">Fiscal year end</Label>
              <Input
                id="client-fye"
                value={fiscalYearEnd}
                onChange={(e) => setFiscalYearEnd(e.target.value)}
                placeholder="December 31"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-contact-name">Contact name</Label>
            <Input
              id="client-contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-contact-email">Contact email</Label>
              <Input
                id="client-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-contact-phone">Contact phone</Label>
              <Input
                id="client-contact-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this client…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {client ? 'Save changes' : 'Add client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ClientModal
