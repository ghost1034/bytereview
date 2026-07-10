'use client'

import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, FileText, Loader2, Trash2 } from 'lucide-react'

import {
  EsignWizardFrame,
  EsignWizardFooter,
  useDraftEnvelope,
} from '@/components/esign/wizard/EsignWizardFrame'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/ui/dropzone'
import { useToast } from '@/hooks/use-toast'
import { useAddDocuments, useDeleteDocument } from '@/hooks/useEnvelopes'

export default function EnvelopeDocumentsPage() {
  const params = useParams<{ envelopeId: string }>()
  const envelopeId = params?.envelopeId
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const envelopeQuery = useDraftEnvelope(envelopeId)
  const envelope = envelopeQuery.data

  const addDocuments = useAddDocuments(envelopeId!)
  const deleteDocument = useDeleteDocument(envelopeId!)

  const nextHref = React.useMemo(() => {
    const query = searchParams?.toString()
    return `/dashboard/esign/${envelopeId}/recipients${query ? `?${query}` : ''}`
  }, [envelopeId, searchParams])

  const handleFiles = async (incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length !== incoming.length) {
      toast({ title: 'Only PDF files are supported', variant: 'destructive' })
    }
    if (pdfs.length === 0) return
    try {
      await addDocuments.mutateAsync(pdfs)
    } catch (error) {
      toast({
        title: 'Failed to add documents',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (documentId: string) => {
    try {
      await deleteDocument.mutateAsync(documentId)
    } catch (error) {
      toast({
        title: 'Failed to remove document',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const documents = envelope?.documents ?? []

  return (
    <EsignWizardFrame
      step="documents"
      envelope={envelope}
      footer={
        <EsignWizardFooter
          primary={
            <Button onClick={() => router.push(nextHref)} disabled={documents.length === 0}>
              Continue to recipients <ArrowRight className="ml-1.5 size-4" />
            </Button>
          }
        />
      }
    >
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div>
          <h2 className="text-base font-semibold">Documents to sign</h2>
          <p className="text-sm text-foreground-muted">
            Signers see the documents in the order listed. Removing a document also removes any
            fields placed on it.
          </p>
        </div>

        <Dropzone
          onFiles={handleFiles}
          accept="application/pdf,.pdf"
          title="Drop PDFs here or click to upload"
          description="PDF only, up to 25 MB each."
        />

        {addDocuments.isPending && (
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <Loader2 className="size-4 animate-spin" /> Uploading…
          </p>
        )}

        {documents.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <FileText className="size-4 shrink-0 text-foreground-muted" />
                <span className="min-w-0 flex-1 truncate">{doc.original_filename}</span>
                <span className="shrink-0 text-xs text-foreground-subtle">
                  {doc.page_count} page{doc.page_count === 1 ? '' : 's'} ·{' '}
                  {(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-foreground-muted hover:text-destructive"
                  onClick={() => handleDelete(doc.id)}
                  disabled={documents.length === 1 || deleteDocument.isPending}
                  aria-label={`Remove ${doc.original_filename}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EsignWizardFrame>
  )
}
