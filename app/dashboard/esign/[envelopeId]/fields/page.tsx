'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

import {
  PdfFieldEditor,
  coerceEditorProperties,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import {
  EsignWizardFrame,
  EsignWizardFooter,
  useDraftEnvelope,
} from '@/components/esign/wizard/EsignWizardFrame'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useReplaceFields } from '@/hooks/useEnvelopes'
import { apiClient, type EsignFieldInput } from '@/lib/api'

export default function EnvelopeFieldsPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const envelopeQuery = useDraftEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)

  const replaceFields = useReplaceFields(envelopeId!)

  React.useEffect(() => {
    if (!envelope || hydratedFor === envelope.id) return
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
        properties: coerceEditorProperties(f.properties),
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
    enabled: !!envelope && envelope.documents.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  const stepHref = (step: string) => {
    const query = searchParams?.toString()
    return `/dashboard/esign/${envelopeId}/${step}${query ? `?${query}` : ''}`
  }

  const saveAndContinue = async () => {
    try {
      await replaceFields.mutateAsync(
        editorFields.map((f) => ({
          id: f.id,
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
          properties: f.properties as EsignFieldInput['properties'],
        })),
      )
      router.push(stepHref('review'))
    } catch (error) {
      toast({
        title: 'Failed to save fields',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const signerRecipients = envelope?.recipients.filter((r) => r.role === 'signer') ?? []

  return (
    <EsignWizardFrame
      step="fields"
      envelope={envelope}
      footer={
        <EsignWizardFooter
          back={
            <Button variant="outline" onClick={() => router.push(stepHref('recipients'))}>
              <ArrowLeft className="mr-1.5 size-4" /> Back
            </Button>
          }
          primary={
            <Button onClick={saveAndContinue} disabled={replaceFields.isPending}>
              {replaceFields.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Continue to review <ArrowRight className="ml-1.5 size-4" />
            </Button>
          }
        />
      }
    >
      {!envelope || documentUrlsQuery.isLoading || !documentUrlsQuery.data ? (
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
    </EsignWizardFrame>
  )
}
