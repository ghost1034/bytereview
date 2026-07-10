'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Loader2, Plus, Send, Trash2 } from 'lucide-react'

import {
  PdfFieldEditor,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import { participantColor } from '@/components/esign/pdf'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EnvelopeStatusBadge } from '@/components/ui/envelope-status-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  useEnvelope,
  useReplaceFields,
  useReplaceRecipients,
  useSaveAsTemplate,
  useSendEnvelope,
} from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'

type WizardStep = 'recipients' | 'fields' | 'review'

interface RecipientDraft {
  email: string
  name: string
  role: 'signer' | 'cc'
  routing_order: number
}

export default function EnvelopeEditPage() {
  const params = useParams<{ envelopeId: string }>()
  const searchParams = useSearchParams()
  const templateIdFromQuery = searchParams?.get('template') ?? undefined
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const { toast } = useToast()

  const envelopeQuery = useEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  const [step, setStep] = React.useState<WizardStep>('recipients')
  const [recipients, setRecipients] = React.useState<RecipientDraft[]>([
    { email: '', name: '', role: 'signer', routing_order: 1 },
  ])
  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false)
  const [templateName, setTemplateName] = React.useState('')

  const replaceRecipients = useReplaceRecipients(envelopeId!)
  const replaceFields = useReplaceFields(envelopeId!)
  const sendEnvelope = useSendEnvelope(envelopeId!)
  const saveAsTemplate = useSaveAsTemplate(envelopeId!)

  // Redirect non-drafts to the detail page.
  React.useEffect(() => {
    if (envelope && envelope.status !== 'draft') {
      router.replace(`/dashboard/esign/${envelope.id}`)
    }
  }, [envelope, router])

  // Hydrate local state from the server once per envelope load.
  React.useEffect(() => {
    if (!envelope || hydratedFor === envelope.id) return
    if (envelope.recipients.length > 0) {
      setRecipients(
        envelope.recipients.map((r) => ({
          email: r.email,
          name: r.name,
          role: (r.role as 'signer' | 'cc') ?? 'signer',
          routing_order: r.routing_order,
        })),
      )
    }
    setEditorFields(
      envelope.fields.map((f) => ({
        id: f.id,
        documentId: f.document_id,
        participantId: f.recipient_id,
        fieldType: f.field_type as EditorFieldType,
        pageNumber: f.page_number,
        posX: f.pos_x,
        posY: f.pos_y,
        width: f.width,
        height: f.height,
        required: f.required,
        label: f.label ?? undefined,
      })),
    )
    setHydratedFor(envelope.id)
  }, [envelope, hydratedFor])

  // Signed URLs for the field editor (refetched when documents change).
  const documentUrlsQuery = useQuery({
    queryKey: ['esign', 'doc-urls', envelopeId, envelope?.documents.map((d) => d.id).join(',')],
    queryFn: async () => {
      const urls: Record<string, string> = {}
      for (const doc of envelope!.documents) {
        const download = await apiClient.getEsignDocumentDownload(envelope!.id, doc.id)
        urls[doc.id] = download.url
      }
      return urls
    },
    enabled: !!envelope && envelope.documents.length > 0 && step === 'fields',
    staleTime: 10 * 60 * 1000,
  })

  if (envelopeQuery.isLoading || !envelope) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const signerRecipients = envelope.recipients.filter((r) => r.role === 'signer')

  const saveRecipients = async (goNext: boolean) => {
    const cleaned = recipients
      .map((r) => ({ ...r, email: r.email.trim().toLowerCase(), name: r.name.trim() }))
      .filter((r) => r.email && r.name)
    if (cleaned.length === 0) {
      toast({ title: 'Add at least one recipient with a name and email', variant: 'destructive' })
      return
    }
    try {
      await replaceRecipients.mutateAsync({
        recipients: cleaned,
        templateId: templateIdFromQuery,
      })
      setHydratedFor(null) // rehydrate fields (recipient ids changed)
      if (goNext) setStep('fields')
    } catch (error) {
      toast({
        title: 'Failed to save recipients',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const saveFields = async (goNext: boolean) => {
    try {
      await replaceFields.mutateAsync(
        editorFields.map((f) => ({
          document_id: f.documentId,
          recipient_id: f.participantId,
          field_type: f.fieldType,
          page_number: f.pageNumber,
          pos_x: f.posX,
          pos_y: f.posY,
          width: f.width,
          height: f.height,
          required: f.required,
          label: f.label,
        })),
      )
      if (goNext) setStep('review')
    } catch (error) {
      toast({
        title: 'Failed to save fields',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleSend = async () => {
    try {
      await sendEnvelope.mutateAsync()
      toast({ title: 'Envelope sent', description: 'The first signer has been notified by email.' })
      router.push(`/dashboard/esign/${envelope.id}`)
    } catch (error) {
      toast({
        title: 'Failed to send envelope',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const steps = [
    { key: 'recipients', label: 'Recipients' },
    { key: 'fields', label: 'Place fields' },
    { key: 'review', label: 'Review & send' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Signature"
        title={envelope.title}
        description={
          <span className="inline-flex items-center gap-2">
            <EnvelopeStatusBadge status={envelope.status} />
            {envelope.documents.length} document{envelope.documents.length === 1 ? '' : 's'}
          </span>
        }
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/esign">
              <ArrowLeft className="mr-1.5 size-4" /> Envelopes
            </Link>
          </Button>
        }
      />

      <div className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <span className="text-foreground-subtle">→</span>}
            <button
              type="button"
              onClick={() => setStep(s.key as WizardStep)}
              className={
                step === s.key
                  ? 'rounded-full bg-primary-soft px-3 py-1 font-medium text-primary'
                  : 'rounded-full px-3 py-1 text-foreground-muted hover:bg-surface-muted'
              }
            >
              {i + 1}. {s.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {step === 'recipients' && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div>
            <h2 className="text-base font-semibold">Who needs to sign?</h2>
            <p className="text-sm text-foreground-muted">
              Every signer must sign in with a CPAAutomation account matching this email — identity is
              verified with SMS phone MFA at every login.
              {envelope.signing_type === 'sequential' &&
                ' Signers are notified in routing order; each signs only after the previous order completes.'}
            </p>
          </div>

          <div className="space-y-3">
            {recipients.map((recipient, index) => {
              const color = participantColor(index)
              return (
                <div key={index} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
                  <span
                    className="mb-2.5 inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.border }}
                    aria-hidden
                  />
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={recipient.name}
                      onChange={(e) =>
                        setRecipients((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                        )
                      }
                      placeholder="Jane Client"
                    />
                  </div>
                  <div className="min-w-52 flex-1 space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input
                      type="email"
                      value={recipient.email}
                      onChange={(e) =>
                        setRecipients((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, email: e.target.value } : r)),
                        )
                      }
                      placeholder="jane@client.com"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Select
                      value={recipient.role}
                      onValueChange={(v) =>
                        setRecipients((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, role: v as 'signer' | 'cc' } : r)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signer">Signer</SelectItem>
                        <SelectItem value="cc">CC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {envelope.signing_type === 'sequential' && recipient.role === 'signer' && (
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Order</Label>
                      <Input
                        type="number"
                        min={1}
                        value={recipient.routing_order}
                        onChange={(e) =>
                          setRecipients((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, routing_order: Math.max(1, Number(e.target.value) || 1) } : r,
                            ),
                          )
                        }
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-0.5 text-foreground-muted hover:text-destructive"
                    onClick={() => setRecipients((prev) => prev.filter((_, i) => i !== index))}
                    disabled={recipients.length === 1}
                    aria-label="Remove recipient"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRecipients((prev) => [
                ...prev,
                {
                  email: '',
                  name: '',
                  role: 'signer',
                  routing_order: Math.max(...prev.map((r) => r.routing_order), 0) + 1,
                },
              ])
            }
          >
            <Plus className="mr-1.5 size-4" /> Add recipient
          </Button>

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={() => saveRecipients(true)} disabled={replaceRecipients.isPending}>
              {replaceRecipients.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Continue to fields <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'fields' && (
        <div className="space-y-4">
          {documentUrlsQuery.isLoading || !documentUrlsQuery.data ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-16 text-foreground-muted">
              <Loader2 className="mr-2 size-4 animate-spin" /> Preparing documents…
            </div>
          ) : signerRecipients.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface p-6 text-sm text-foreground-muted">
              Save recipients first — fields are assigned to individual signers.
            </p>
          ) : (
            <PdfFieldEditor
              documents={envelope.documents.map((d) => ({
                id: d.id,
                name: d.original_filename,
                url: documentUrlsQuery.data[d.id],
                pageCount: d.page_count,
              }))}
              participants={signerRecipients.map((r) => ({
                id: r.id,
                label: `${r.name} (${r.email})`,
              }))}
              fields={editorFields}
              onChange={setEditorFields}
            />
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('recipients')}>
              <ArrowLeft className="mr-1.5 size-4" /> Back
            </Button>
            <Button onClick={() => saveFields(true)} disabled={replaceFields.isPending}>
              {replaceFields.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Continue to review <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Review & send</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-foreground-subtle">Documents</dt>
              <dd>
                {envelope.documents.map((d) => (
                  <div key={d.id}>{d.original_filename} ({d.page_count} pages)</div>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Signers (in order)</dt>
              <dd>
                {[...signerRecipients]
                  .sort((a, b) => a.routing_order - b.routing_order)
                  .map((r) => (
                    <div key={r.id}>
                      {r.routing_order}. {r.name} — {r.email}
                    </div>
                  ))}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Fields placed</dt>
              <dd>{editorFields.length}</dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Expiration & reminders</dt>
              <dd>
                {envelope.expires_at
                  ? `Expires ${new Date(envelope.expires_at).toLocaleDateString()}`
                  : 'Expires 30 days after sending'}
                {envelope.reminder_interval_hours
                  ? ` · reminders every ${envelope.reminder_interval_hours}h`
                  : ''}
              </dd>
            </div>
          </dl>
          <p className="rounded-md bg-surface-muted p-3 text-xs text-foreground-muted">
            On send, each signer must consent to electronic records (ESIGN/UETA), sign in with phone
            MFA, and explicitly adopt their signature. Every action is written to an append-only
            audit trail, and the completed document is sealed with a tamper-evident digital signature.
          </p>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('fields')}>
                <ArrowLeft className="mr-1.5 size-4" /> Back
              </Button>
              <Button variant="outline" onClick={() => setSaveTemplateOpen(true)}>
                Save as template
              </Button>
            </div>
            <Button onClick={handleSend} disabled={sendEnvelope.isPending}>
              {sendEnvelope.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Send for signature
            </Button>
          </div>
        </div>
      )}

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Standard engagement letter"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!templateName.trim() || saveAsTemplate.isPending}
              onClick={async () => {
                try {
                  await saveAsTemplate.mutateAsync({ name: templateName.trim() })
                  toast({ title: 'Template saved' })
                  setSaveTemplateOpen(false)
                } catch (error) {
                  toast({
                    title: 'Failed to save template',
                    description: error instanceof Error ? error.message : undefined,
                    variant: 'destructive',
                  })
                }
              }}
            >
              {saveAsTemplate.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
