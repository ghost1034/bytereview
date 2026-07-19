'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Circle,
  Download,
  FileBadge,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  useVoidEnvelope,
} from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'

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

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  notified: 'Notified',
  viewed: 'Viewed',
  consented: 'Consented',
  signed: 'Signed',
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
}

/** "Viewed Jul 3, 2:14 PM · Consented … · Signed …" from recipient timestamps. */
function recipientTimeline(recipient: {
  viewed_at?: string | null
  consented_at?: string | null
  signed_at?: string | null
  declined_at?: string | null
}): string {
  const parts: string[] = []
  if (recipient.viewed_at) parts.push(`Viewed ${formatDateTime(recipient.viewed_at)}`)
  if (recipient.consented_at) parts.push(`Consented ${formatDateTime(recipient.consented_at)}`)
  if (recipient.signed_at) parts.push(`Signed ${formatDateTime(recipient.signed_at)}`)
  if (recipient.declined_at) parts.push(`Declined ${formatDateTime(recipient.declined_at)}`)
  return parts.join(' · ')
}

export default function EnvelopeDetailPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const { toast } = useToast()

  const envelopeQuery = useEnvelope(envelopeId)
  const auditQuery = useEnvelopeAudit(envelopeId)
  const remind = useRemindEnvelope(envelopeId!)
  const voidEnvelope = useVoidEnvelope(envelopeId!)

  const [voidOpen, setVoidOpen] = React.useState(false)
  const [voidReason, setVoidReason] = React.useState('')
  const [downloading, setDownloading] = React.useState<string | null>(null)

  const envelope = envelopeQuery.data

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
  const signers = envelope.recipients.filter((r) => r.role === 'signer')

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
                <Button
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
                </Button>
                <Button variant="outline" className="text-destructive" onClick={() => setVoidOpen(true)}>
                  <XCircle className="mr-1.5 size-4" /> Void
                </Button>
              </>
            )}
          </div>
        }
      />

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

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="summary" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Summary</TabsTrigger>
          <TabsTrigger value="recipients" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Recipients</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">Documents</TabsTrigger>
          <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">History</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">Status timeline</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div><p className="text-xs text-foreground-subtle">Created</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.created_at)}</p></div>
              <div><p className="text-xs text-foreground-subtle">Sent</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.sent_at)}</p></div>
              <div><p className="text-xs text-foreground-subtle">Progress</p><p className="mt-1 text-sm font-medium">{signers.filter((recipient) => recipient.status === 'signed').length} of {signers.length} signed</p></div>
              <div><p className="text-xs text-foreground-subtle">Completed</p><p className="mt-1 text-sm font-medium">{formatDateTime(envelope.completed_at)}</p></div>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="recipients">
        {/* Recipients timeline */}
        <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Recipients</h2>
          <ol className="space-y-3">
            {[...signers]
              .sort((a, b) => a.routing_order - b.routing_order)
              .map((recipient) => {
                const timeline = recipientTimeline(recipient)
                return (
                  <li key={recipient.id} className="flex items-start gap-3">
                    {recipient.status === 'signed' ? (
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
    </div>
  )
}
