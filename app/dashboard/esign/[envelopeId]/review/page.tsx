'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Send } from 'lucide-react'

import {
  EsignWizardFrame,
  EsignWizardFooter,
  useDraftEnvelope,
} from '@/components/esign/wizard/EsignWizardFrame'
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
import { useToast } from '@/hooks/use-toast'
import { useSaveAsTemplate, useSendEnvelope } from '@/hooks/useEnvelopes'

export default function EnvelopeReviewPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const envelopeQuery = useDraftEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false)
  const [templateName, setTemplateName] = React.useState('')

  const sendEnvelope = useSendEnvelope(envelopeId!)
  const saveAsTemplate = useSaveAsTemplate(envelopeId!)

  const stepHref = (step: string) => {
    const query = searchParams?.toString()
    return `/dashboard/esign/${envelopeId}/${step}${query ? `?${query}` : ''}`
  }

  const handleSend = async () => {
    if (!envelope) return
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

  const signerRecipients = envelope?.recipients.filter((r) => r.role === 'signer') ?? []

  return (
    <EsignWizardFrame
      step="review"
      envelope={envelope}
      footer={
        <EsignWizardFooter
          back={
            <Button variant="outline" onClick={() => router.push(stepHref('fields'))}>
              <ArrowLeft className="mr-1.5 size-4" /> Back
            </Button>
          }
          secondary={
            <Button variant="outline" onClick={() => setSaveTemplateOpen(true)}>
              Save as template
            </Button>
          }
          primary={
            <Button onClick={handleSend} disabled={sendEnvelope.isPending}>
              {sendEnvelope.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Send for signature
            </Button>
          }
        />
      }
    >
      {envelope && (
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
                  .map((r, i) => (
                    <div key={r.id}>
                      {i + 1}. {r.name} — {r.email}
                    </div>
                  ))}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-subtle">Fields placed</dt>
              <dd>{envelope.fields.length}</dd>
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
    </EsignWizardFrame>
  )
}
