'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useEnvelope } from '@/hooks/useEnvelopes'
import { apiClient, type EsignRecipientInput } from '@/lib/api'

const ROLES = ['signer', 'cc', 'approver', 'certified_delivery', 'agent', 'editor', 'witness', 'in_person_signer'] as const

export default function CorrectRecipientsPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const query = useEnvelope(envelopeId)
  const [rows, setRows] = React.useState<EsignRecipientInput[]>([])
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const envelope = query.data

  React.useEffect(() => {
    if (!envelope || hydrated) return
    setRows(envelope.recipients.map((recipient) => ({
      id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role as typeof ROLES[number],
      routing_order: recipient.routing_order, role_label: recipient.role_label,
      private_message: recipient.private_message, managed_by_recipient_id: recipient.managed_by_recipient_id,
      witness_for_recipient_id: recipient.witness_for_recipient_id, host_name: recipient.host_name,
      host_email: recipient.host_email, allow_reassignment: recipient.allow_reassignment,
    })))
    setHydrated(true)
  }, [envelope, hydrated])

  if (query.isLoading || !envelope) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="mr-2 size-5 animate-spin" /> Loading recipients…</div>
  const completed = new Set(envelope.recipients.filter((recipient) => recipient.action_completed_at).map((recipient) => recipient.id))
  const initial = new Map(envelope.recipients.map((recipient) => [recipient.id, recipient]))
  const changed = rows.filter((row) => {
    const before = row.id ? initial.get(row.id) : undefined
    return !before || before.name !== row.name || before.email !== row.email || before.role !== row.role || before.routing_order !== row.routing_order || (before.private_message ?? '') !== (row.private_message ?? '')
  }).length + envelope.recipients.filter((recipient) => !rows.some((row) => row.id === recipient.id)).length

  const save = async () => {
    if (!reason.trim()) { toast({ title: 'Enter a reason for this correction', variant: 'destructive' }); return }
    setSaving(true)
    try {
      await apiClient.correctEsignRecipients(envelopeId, { recipients: rows, reason: reason.trim(), expected_routing_version: envelope.routing_version })
      toast({ title: 'Recipient correction committed', description: 'Routing and access were recalculated atomically.' })
      router.push(`/dashboard/esign/${envelopeId}`)
    } catch (error) {
      toast({ title: 'Correction could not be committed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-foreground-muted">E-Signature · routing version {envelope.routing_version}</p><h1 className="text-2xl font-semibold">Correct recipients</h1><p className="text-sm text-foreground-muted">Completed recipients are locked. Document and field correction remains out of scope.</p></div><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 size-4" /> Cancel</Button></div>
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">{rows.map((row, index) => { const locked = !!row.id && completed.has(row.id); const update = (changes: Partial<EsignRecipientInput>) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)); return <div key={row.id ?? index} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_1.2fr_170px_80px_auto]"><div><Label className="text-xs">Name</Label><Input disabled={locked} value={row.name ?? ''} onChange={(event) => update({ name: event.target.value || null })} /></div><div><Label className="text-xs">Email</Label><Input disabled={locked} type="email" value={row.email ?? ''} onChange={(event) => update({ email: event.target.value || null })} /></div><div><Label className="text-xs">Role</Label><Select disabled={locked} value={row.role} onValueChange={(role) => update({ role: role as typeof row.role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((role) => <SelectItem key={role} value={role}>{role.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Step</Label><Input disabled={locked} type="number" min={1} value={row.routing_order} onChange={(event) => update({ routing_order: Math.max(1, Number(event.target.value) || 1) })} /></div><Button variant="ghost" size="icon" disabled={locked} onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></Button><div className="md:col-span-5"><Label className="text-xs">Private message</Label><Input disabled={locked} value={row.private_message ?? ''} onChange={(event) => update({ private_message: event.target.value || null })} /></div></div>})}</section>
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5"><p className="text-sm font-medium">Change summary: {changed} recipient change{changed === 1 ? '' : 's'}</p><div><Label htmlFor="correction-reason">Required reason</Label><Textarea id="correction-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why recipient routing or identity is being corrected…" /></div><Button disabled={saving || changed === 0 || !reason.trim()} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} Commit correction</Button></section>
  </div>
}

