'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  FileBadge,
  Loader2,
  RotateCcw,
  Settings2,
  ShieldCheck,
  UserRoundPen,
  Users,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EnvelopeStatusBadge } from '@/components/ui/envelope-status-badge'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useEnvelope,
  useEnvelopeAudit,
  useRemindEnvelope,
  useUnscheduleEnvelope,
  useUpdateEnvelopeDeliverySettings,
  useVoidEnvelope,
} from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateInput(value?: string | null) {
  const date = value ? new Date(value) : new Date()
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  notified: 'Notified',
  viewed: 'Viewed',
  consented: 'Consented',
  signed: 'Signed',
  approved: 'Approved',
  delivered: 'Delivered',
  managed: 'Managed',
  declined: 'Declined',
}

const EVENT_LABEL: Record<string, string> = {
  created: 'Envelope created',
  sent: 'Sent for signature',
  viewed: 'Viewed',
  consent_given: 'Consented to electronic records',
  signed: 'Signed',
  declined: 'Declined',
  voided: 'Voided',
  completed: 'Completed',
  reminder_sent: 'Reminder sent',
  sealed: 'Digitally sealed',
  expired: 'Expired',
  expiration_warning: 'Expiration warning sent',
  settings_updated: 'Delivery settings updated',
  corrected: 'Recipients corrected',
  reassigned: 'Recipient reassigned',
  approved: 'Approved',
  delivered: 'Certified delivery recorded',
  manager_action: 'Manager action',
  witness_configured: 'Witness configured',
  host_handoff: 'Hosted handoff started',
  guest_invitation_exchanged: 'Guest invitation exchanged',
  guest_consent_given: 'Guest consent recorded',
  routing_advanced: 'Routing advanced',
}

/** "Viewed Jul 3, 2:14 PM · Consented … · Signed …" from recipient timestamps. */
function recipientTimeline(recipient: {
  viewed_at?: string | null
  consented_at?: string | null
  signed_at?: string | null
  declined_at?: string | null
  action_completed_at?: string | null
}): string {
  const parts: string[] = []
  if (recipient.viewed_at) parts.push(`Viewed ${formatDateTime(recipient.viewed_at)}`)
  if (recipient.consented_at) parts.push(`Consented ${formatDateTime(recipient.consented_at)}`)
  if (recipient.signed_at) parts.push(`Signed ${formatDateTime(recipient.signed_at)}`)
  if (recipient.declined_at) parts.push(`Declined ${formatDateTime(recipient.declined_at)}`)
  if (recipient.action_completed_at && !recipient.signed_at) parts.push(`Completed ${formatDateTime(recipient.action_completed_at)}`)
  return parts.join(' · ')
}

export default function EnvelopeDetailPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const firm = useAnalyticsFirm()

  const envelopeQuery = useEnvelope(envelopeId)
  const auditQuery = useEnvelopeAudit(envelopeId)
  const remind = useRemindEnvelope(envelopeId!)
  const voidEnvelope = useVoidEnvelope(envelopeId!)
  const unschedule = useUnscheduleEnvelope(envelopeId!)
  const updateDeliverySettings = useUpdateEnvelopeDeliverySettings(envelopeId!)

  const [voidOpen, setVoidOpen] = React.useState(false)
  const [voidReason, setVoidReason] = React.useState('')
  const [downloading, setDownloading] = React.useState<string | null>(null)
  const [shareUserId, setShareUserId] = React.useState(''); const [shareLevel, setShareLevel] = React.useState<'view' | 'manage'>('view')
  const [transferOpen, setTransferOpen] = React.useState(false); const [successorId, setSuccessorId] = React.useState(''); const [retainView, setRetainView] = React.useState(true)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [expirationEnabled, setExpirationEnabled] = React.useState(false)
  const [expirationDate, setExpirationDate] = React.useState('')
  const [remindersEnabled, setRemindersEnabled] = React.useState(false)
  const [reminderHours, setReminderHours] = React.useState('72')

  const envelope = envelopeQuery.data
  const accessQuery = useQuery({
    queryKey: ['esign', 'envelope', envelopeId, 'access'],
    queryFn: () => apiClient.getEsignEnvelopeAccess(envelopeId!),
    enabled: !!envelopeId,
  })
  const deliveryQuery = useQuery({
    queryKey: ['esign', 'envelope', envelopeId, 'email-deliveries'],
    queryFn: () => apiClient.request<{ deliveries: Array<{ id: string; kind: string; to_email: string; state: string; attempt_count: number; last_error?: string | null; created_at: string; delivered_at?: string | null }> }>(`/api/esign/envelopes/${envelopeId}/email-deliveries`),
    enabled: !!envelopeId,
  })

  React.useEffect(() => {
    if (envelope && envelope.status === 'draft') {
      router.replace(`/dashboard/esign/${envelope.id}/prepare`)
    }
  }, [envelope, router])

  if (envelopeQuery.isLoading || !envelope) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const isActive = envelope.status === 'sent' || envelope.status === 'in_progress'
  const signers = envelope.recipients.filter((r) => ['signer', 'witness', 'in_person_signer'].includes(r.role))
  const actionableRecipients = envelope.recipients.filter((r) => r.role !== 'cc')

  const openDownload = async (kind: 'sealed' | 'certificate' | { documentId: string }) => {
    const key = typeof kind === 'string' ? kind : kind.documentId
    setDownloading(key)
    try {
      const result =
        kind === 'sealed'
          ? await apiClient.getEsignSealedDownload(envelope.id)
          : kind === 'certificate'
            ? await apiClient.getEsignCertificateDownload(envelope.id)
            : await apiClient.getEsignDocumentDownload(envelope.id, kind.documentId)
      window.open(result.url, '_blank', 'noopener')
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setDownloading(null)
    }
  }

  const openDeliverySettings = () => {
    setExpirationEnabled(envelope.expires_at != null)
    setExpirationDate(envelope.expires_at ? formatDateInput(envelope.expires_at) : '')
    setRemindersEnabled(envelope.reminder_interval_hours != null)
    setReminderHours(String(envelope.reminder_interval_hours ?? 72))
    setSettingsOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title={envelope.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <EnvelopeStatusBadge status={envelope.status} />
            {envelope.sent_at && <span>Sent {formatDateTime(envelope.sent_at)}</span>}
            {envelope.expires_at && isActive && (
              <span>· expires {formatDateTime(envelope.expires_at)}</span>
            )}
            {envelope.scheduled_at && <span>Scheduled {formatDateTime(envelope.scheduled_at)} · {envelope.schedule_timezone}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/esign">
                <ArrowLeft className="mr-1.5 size-4" /> Envelopes
              </Link>
            </Button>
            {isActive && (
              <>
                {envelope.available_actions?.includes('manage_settings') && <Button variant="outline" onClick={openDeliverySettings}>
                  <Settings2 className="mr-1.5 size-4" /> Manage settings
                </Button>}
                {envelope.available_actions?.includes('correct') && <Button variant="outline" asChild><Link href={`/dashboard/esign/${envelope.id}/correct`}><UserRoundPen className="mr-1.5 size-4" /> Correct recipients</Link></Button>}
                {envelope.available_actions?.includes('remind') && <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await remind.mutateAsync()
                      toast({
                        title: 'Reminders sent',
                        description: result.reminded.length
                          ? `Reminded ${result.reminded.join(', ')}`
                          : 'No signers are currently pending.',
                      })
                    } catch (error) {
                      toast({
                        title: 'Failed to send reminders',
                        description: error instanceof Error ? error.message : undefined,
                        variant: 'destructive',
                      })
                    }
                  }}
                  disabled={remind.isPending}
                >
                  {remind.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <BellRing className="mr-1.5 size-4" />
                  )}
                  Remind
                </Button>}
                {envelope.available_actions?.includes('void') && <Button variant="outline" className="text-destructive" onClick={() => setVoidOpen(true)}>
                  <XCircle className="mr-1.5 size-4" /> Void
                </Button>}
              </>
            )}
            {envelope.status === 'scheduled' && envelope.available_actions?.includes('edit') && <Button variant="outline" disabled={unschedule.isPending} onClick={async () => { try { await unschedule.mutateAsync(); toast({ title: 'Envelope returned to draft' }); router.push(`/dashboard/esign/${envelope.id}/prepare`) } catch (error) { toast({ title: 'Could not unschedule', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><CalendarClock className="mr-1.5 size-4" /> Unschedule & edit</Button>}
          </div>
        }
      />

      {envelope.status === 'send_failed' && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"><AlertTriangle className="size-5 text-destructive" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Send failed · {envelope.send_error_code || 'delivery_error'}</p><p className="text-xs text-foreground-muted">{envelope.send_error_message || 'The envelope could not be sent.'}</p></div><Button size="sm" variant="outline" onClick={async () => { try { await apiClient.recoverFailedEsignSendDraft(envelope.id); router.push(`/dashboard/esign/${envelope.id}/prepare`) } catch (error) { toast({ title: 'Could not recover draft', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><UserRoundPen className="mr-1 size-3" /> Edit draft</Button><Button size="sm" onClick={async () => { try { await apiClient.retryFailedEsignSend(envelope.id); await envelopeQuery.refetch(); toast({ title: 'Envelope sent' }) } catch (error) { toast({ title: 'Retry failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><RotateCcw className="mr-1 size-3" /> Retry send</Button></div>}

      {envelope.status === 'completed' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-4">
          <ShieldCheck className="size-5 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Completed and digitally sealed</p>
            <p className="truncate font-mono text-xs text-foreground-muted">
              SHA-256 {envelope.sealed_sha256}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openDownload('sealed')} disabled={downloading === 'sealed'}>
              <Download className="mr-1.5 size-4" /> Signed PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDownload('certificate')}
              disabled={downloading === 'certificate'}
            >
              <FileBadge className="mr-1.5 size-4" /> Certificate
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/esign/verify?envelope=${envelope.id}`}>Verify</Link>
            </Button>
          </div>
        </div>
      )}

      {envelope.voided_reason && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
          Voided: {envelope.voided_reason}
        </p>
      )}

      {['queued', 'dispatching', 'dispatched', 'processing', 'retry', 'terminal'].includes(envelope.sealing_state) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
          <Loader2 className={cn('size-4', !['retry', 'terminal'].includes(envelope.sealing_state) && 'animate-spin')} />
          <div className="min-w-0 flex-1"><p className="font-medium">Digital sealing: {envelope.sealing_state.replace(/_/g, ' ')}</p>{envelope.sealing_last_error && <p className="truncate text-xs text-foreground-muted">{envelope.sealing_last_error}</p>}</div>
          {envelope.available_actions?.includes('retry_sealing') && <Button size="sm" variant="outline" onClick={async () => { try { await apiClient.request(`/api/esign/envelopes/${envelope.id}/retry-sealing`, { method: 'POST' }); await envelopeQuery.refetch(); toast({ title: 'Sealing retry queued' }) } catch (error) { toast({ title: 'Could not retry sealing', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Retry sealing</Button>}
        </div>
      )}

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="summary" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Summary</TabsTrigger>
          <TabsTrigger value="recipients" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Recipients</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Documents</TabsTrigger>
          <TabsTrigger value="access" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Access</TabsTrigger>
          <TabsTrigger value="delivery" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Delivery</TabsTrigger>
          <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">History</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">Status timeline</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div><p className="text-xs text-foreground-subtle">Created</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.created_at)}</p></div>
              <div><p className="text-xs text-foreground-subtle">Sent</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.sent_at)}</p></div>
              <div><p className="text-xs text-foreground-subtle">Progress</p><p className="mt-1 text-sm font-medium">{signers.filter((recipient) => recipient.status === 'signed').length} of {signers.length} signed</p></div>
              <div><p className="text-xs text-foreground-subtle">Completed</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.completed_at)}</p></div>
            </div>
          </section>
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold">Delivery settings</h2><p className="text-xs text-foreground-muted">These settings remain adjustable while recipients are still completing the envelope.</p></div>
              {isActive && envelope.available_actions?.includes('manage_settings') && <Button size="sm" variant="outline" onClick={openDeliverySettings}><Settings2 className="mr-1.5 size-4" /> Manage</Button>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><p className="text-xs text-foreground-subtle">Expiration</p><p className="mt-1 text-sm font-medium">{envelope.expires_at ? formatDateTime(envelope.expires_at) : 'No expiration'}</p></div>
              <div><p className="text-xs text-foreground-subtle">Automatic reminders</p><p className="mt-1 text-sm font-medium">{envelope.reminder_interval_hours ? `Every ${envelope.reminder_interval_hours} hours` : 'Off'}</p></div>
              <div><p className="text-xs text-foreground-subtle">Last reminder</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.last_reminder_at)}</p></div>
            </div>
          </section>
          </div>
        </TabsContent>
        <TabsContent value="access">
          <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-3"><Users className="size-5 text-primary" /><div><h2 className="text-base font-semibold">Envelope access</h2><p className="text-sm text-foreground-muted">Owner: {envelope.owner_name || envelope.owner_email || accessQuery.data?.owner_id || envelope.owner_id}</p></div></div>
            {envelope.available_actions?.includes('share') && <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_140px_auto]"><Select value={shareUserId} onValueChange={setShareUserId}><SelectTrigger><SelectValue placeholder="Choose a firm user" /></SelectTrigger><SelectContent>{firm.data?.members?.filter(member => member.user_id !== envelope.owner_id).map(member => <SelectItem key={member.user_id} value={member.user_id}>{member.display_name || member.email}</SelectItem>)}</SelectContent></Select><Select value={shareLevel} onValueChange={value => setShareLevel(value as 'view' | 'manage')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Can view</SelectItem><SelectItem value="manage">Can manage</SelectItem></SelectContent></Select><Button disabled={!shareUserId} onClick={async () => { try { await apiClient.grantEsignEnvelopeAccess(envelope.id, shareUserId, shareLevel); setShareUserId(''); await accessQuery.refetch(); await auditQuery.refetch(); toast({ title: 'Envelope access updated' }) } catch (error) { toast({ title: 'Could not share envelope', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Grant access</Button></div>}
            {accessQuery.data?.grants.length ? <div className="divide-y divide-border rounded-md border border-border">{accessQuery.data.grants.map((grant) => <div key={String(grant.user_id)} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{String(grant.name || grant.email)}</p><p className="text-xs text-foreground-muted">{String(grant.email)}</p></div><div className="flex items-center gap-2"><Select value={String(grant.access_level)} disabled={!envelope.available_actions?.includes('share')} onValueChange={async value => { try { await apiClient.grantEsignEnvelopeAccess(envelope.id, String(grant.user_id), value as 'view' | 'manage'); await accessQuery.refetch(); toast({ title: 'Access level changed' }) } catch (error) { toast({ title: 'Could not change access', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Can view</SelectItem><SelectItem value="manage">Can manage</SelectItem></SelectContent></Select>{envelope.available_actions?.includes('share') && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { try { await apiClient.revokeEsignEnvelopeAccess(envelope.id, String(grant.user_id)); await accessQuery.refetch(); await auditQuery.refetch(); toast({ title: 'Access revoked' }) } catch (error) { toast({ title: 'Could not revoke access', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Revoke</Button>}</div></div>)}</div> : <p className="rounded-md border border-dashed border-border p-5 text-sm text-foreground-muted">This envelope has no direct sharing grants. Firm administrators still retain oversight.</p>}
            {envelope.available_actions?.includes('transfer') && <div className="flex items-center justify-between rounded-md bg-surface-muted p-3"><div><p className="text-sm font-medium">Transfer custody</p><p className="text-xs text-foreground-muted">The new owner controls sharing and the change is fully audited.</p></div><Button variant="outline" onClick={() => setTransferOpen(true)}>Transfer</Button></div>}
          </section>
        </TabsContent>
        <TabsContent value="recipients">
        {/* Recipients timeline */}
        <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Recipients</h2>
          <ol className="space-y-3">
            {[...actionableRecipients]
              .sort((a, b) => a.routing_order - b.routing_order)
              .map((recipient) => {
                const timeline = recipientTimeline(recipient)
                return (
                  <li key={recipient.id} className="flex items-start gap-3">
                    {recipient.action_completed_at ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                    ) : recipient.status === 'declined' ? (
                      <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-foreground-subtle" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {recipient.routing_order}. {recipient.name}
                        <span className="ml-2 font-normal text-foreground-muted">{recipient.email}</span>
                        <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-normal capitalize text-foreground-muted">{recipient.role.replace(/_/g, ' ')}</span>
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}
                        {timeline && ` · ${timeline}`}
                        {recipient.declined_reason && ` — "${recipient.declined_reason}"`}
                      </p>
                    </div>
                  </li>
                )
              })}
            {envelope.recipients
              .filter((r) => r.role === 'cc')
              .map((recipient) => (
                <li key={recipient.id} className="flex items-start gap-3">
                  <Circle className="mt-0.5 size-5 shrink-0 text-foreground-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {recipient.name}
                      <span className="ml-2 font-normal text-foreground-muted">{recipient.email}</span>
                      <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-normal text-foreground-muted">
                        Receives a copy
                      </span>
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}
                      {recipient.viewed_at && ` · Viewed ${formatDateTime(recipient.viewed_at)}`}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        </section>
        </TabsContent>

        <TabsContent value="delivery">
          <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
            <div><h2 className="text-base font-semibold">Email delivery</h2><p className="text-xs text-foreground-muted">Invitation and lifecycle emails retry independently from envelope state.</p></div>
            {(deliveryQuery.data?.deliveries ?? []).length ? <div className="divide-y divide-border rounded-md border border-border">{deliveryQuery.data!.deliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center gap-3 p-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate font-medium">{delivery.to_email}</p><p className="text-xs text-foreground-muted">{delivery.kind.replace(/_/g, ' ')} · {delivery.state} · {delivery.attempt_count} attempt{delivery.attempt_count === 1 ? '' : 's'}</p>{delivery.last_error && <p className="truncate text-xs text-destructive">{delivery.last_error}</p>}</div>{['retry', 'terminal'].includes(delivery.state) && <Button size="sm" variant="outline" onClick={async () => { try { await apiClient.request(`/api/esign/envelopes/${envelope.id}/email-deliveries/${delivery.id}/resend`, { method: 'POST' }); await queryClient.invalidateQueries({ queryKey: ['esign', 'envelope', envelopeId] }); toast({ title: 'Email resend queued' }) } catch (error) { toast({ title: 'Could not resend email', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Resend</Button>}</div>)}</div> : <p className="rounded-md border border-dashed border-border p-5 text-sm text-foreground-muted">No email deliveries have been queued for this envelope.</p>}
          </section>
        </TabsContent>

        {/* Documents + hashes */}
        <TabsContent value="documents">
        <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Documents & integrity</h2>
          <ul className="space-y-3">
            {envelope.documents.map((doc) => (
              <li key={doc.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{doc.original_filename}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDownload({ documentId: doc.id })}
                    disabled={downloading === doc.id}
                  >
                    <Download className="size-4" />
                  </Button>
                </div>
                <p className="truncate font-mono text-[11px] text-foreground-subtle">
                  original {doc.original_sha256}
                </p>
                {doc.flattened_sha256 && (
                  <p className="truncate font-mono text-[11px] text-foreground-subtle">
                    flattened {doc.flattened_sha256}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
        </TabsContent>

      {/* Audit trail */}
      <TabsContent value="history">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Audit trail</h2>
        <p className="text-xs text-foreground-muted">
          Append-only record — entries can never be modified or deleted, even by CPAAutomation.
        </p>
        {auditQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>IP address</TableHead>
                  <TableHead>MFA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data?.events ?? []).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-foreground-muted">
                      {formatDateTime(event.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {EVENT_LABEL[event.event_type] ?? event.event_type}
                    </TableCell>
                    <TableCell className="text-foreground-muted">{event.actor_email ?? 'system'}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground-muted">
                      {event.ip_address ?? '—'}
                    </TableCell>
                    <TableCell>
                      {event.mfa_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <ShieldCheck className="size-3.5" /> phone
                        </span>
                      ) : (
                        <span className="text-xs text-foreground-subtle">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      </TabsContent>
      </Tabs>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage delivery settings</DialogTitle>
            <DialogDescription>
              Change the deadline and automatic reminder schedule for this active envelope. Changes are recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={expirationEnabled} onChange={(event) => setExpirationEnabled(event.target.checked)} /> Envelope expires</label>
              <Label htmlFor="active-envelope-expires" className="sr-only">Expiration date</Label>
              <Input id="active-envelope-expires" type="date" min={formatDateInput()} value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} disabled={!expirationEnabled} />
              <p className="text-xs text-foreground-muted">{expirationEnabled ? 'Recipients must finish by the end of this date.' : 'The envelope will remain active until completed, declined, or voided.'}</p>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} /> Automatic reminders</label>
              <Label htmlFor="active-envelope-reminders">Reminder interval (hours)</Label>
              <Input id="active-envelope-reminders" type="number" min={1} max={720} step={1} value={reminderHours} onChange={(event) => setReminderHours(event.target.value)} disabled={!remindersEnabled} />
              <p className="text-xs text-foreground-muted">{remindersEnabled ? 'Pending recipients are reminded after this interval.' : 'You can still use the Remind button manually.'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button disabled={updateDeliverySettings.isPending} onClick={async () => {
              const interval = Number(reminderHours)
              if (expirationEnabled && !expirationDate) { toast({ title: 'Choose an expiration date', variant: 'destructive' }); return }
              if (remindersEnabled && (!Number.isInteger(interval) || interval < 1 || interval > 720)) { toast({ title: 'Reminder interval must be between 1 and 720 hours', variant: 'destructive' }); return }
              const expiresAt = expirationEnabled ? new Date(`${expirationDate}T23:59:59`).toISOString() : null
              if (expiresAt && new Date(expiresAt) <= new Date()) { toast({ title: 'Expiration date must be in the future', variant: 'destructive' }); return }
              try {
                await updateDeliverySettings.mutateAsync({ expires_at: expiresAt, reminder_interval_hours: remindersEnabled ? interval : null })
                setSettingsOpen(false)
                toast({ title: 'Delivery settings updated' })
              } catch (error) {
                toast({ title: 'Could not update delivery settings', description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
              }
            }}>{updateDeliverySettings.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void envelope</DialogTitle>
            <DialogDescription>
              Voiding permanently stops signing. Signers who were notified will receive an email.
              The envelope and its audit trail are retained.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason for voiding (required)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || voidEnvelope.isPending}
              onClick={async () => {
                try {
                  await voidEnvelope.mutateAsync(voidReason.trim())
                  toast({ title: 'Envelope voided' })
                  setVoidOpen(false)
                } catch (error) {
                  toast({
                    title: 'Failed to void envelope',
                    description: error instanceof Error ? error.message : undefined,
                    variant: 'destructive',
                  })
                }
              }}
            >
              {voidEnvelope.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Void envelope
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Transfer envelope custody</DialogTitle><DialogDescription>This changes the legal record custodian inside your firm. The transfer and retain-view choice will be added to the audit trail.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>New owner</Label><Select value={successorId} onValueChange={setSuccessorId}><SelectTrigger><SelectValue placeholder="Choose a firm user" /></SelectTrigger><SelectContent>{firm.data?.members?.filter(member => member.user_id !== envelope.owner_id).map(member => <SelectItem key={member.user_id} value={member.user_id}>{member.display_name || member.email}</SelectItem>)}</SelectContent></Select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retainView} onChange={event => setRetainView(event.target.checked)} /> Keep the previous owner as a viewer</label></div><DialogFooter><Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button><Button disabled={!successorId} onClick={async () => { try { await apiClient.transferEsignEnvelope(envelope.id, successorId, retainView); await Promise.all([envelopeQuery.refetch(), accessQuery.refetch(), auditQuery.refetch()]); setTransferOpen(false); setSuccessorId(''); toast({ title: 'Custody transferred' }) } catch (error) { toast({ title: 'Transfer failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Confirm transfer</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}
