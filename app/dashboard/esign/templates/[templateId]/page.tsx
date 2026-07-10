'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Save, Send } from 'lucide-react'

import {
  PdfFieldEditor,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useEsignTemplate, useUpdateEsignTemplate } from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'

/**
 * Template field editor — the same PdfFieldEditor as the envelope wizard, but
 * participants are recipient *roles* (by index), materialized to real
 * recipients when an envelope is created from this template.
 */
export default function EsignTemplateEditPage() {
  const params = useParams<{ templateId: string }>()
  const templateId = params?.templateId
  const router = useRouter()
  const { toast } = useToast()

  const templateQuery = useEsignTemplate(templateId)
  const updateTemplate = useUpdateEsignTemplate(templateId!)
  const template = templateQuery.data

  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!template || hydratedFor === template.id) return
    setEditorFields(
      template.fields.map((f) => ({
        id: f.id,
        documentId: f.template_document_id,
        participantId: String(f.recipient_index),
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
    setHydratedFor(template.id)
  }, [template, hydratedFor])

  const documentUrlsQuery = useQuery({
    queryKey: ['esign', 'template-doc-urls', templateId],
    queryFn: async () => {
      const urls: Record<string, string> = {}
      for (const doc of template!.documents) {
        const download = await apiClient.getEsignTemplateDocumentDownload(template!.id, doc.id)
        urls[doc.id] = download.url
      }
      return urls
    },
    enabled: !!template && template.documents.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  if (templateQuery.isLoading || !template) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const roles = (template.recipient_roles as { label?: string }[]).map(
    (role, index) => ({
      id: String(index),
      label: role.label || `Signer ${index + 1}`,
    }),
  )

  const handleSave = async () => {
    try {
      await updateTemplate.mutateAsync({
        fields: editorFields.map((f) => ({
          template_document_id: f.documentId,
          recipient_index: Number(f.participantId),
          field_type: f.fieldType,
          page_number: f.pageNumber,
          pos_x: f.posX,
          pos_y: f.posY,
          width: f.width,
          height: f.height,
          required: f.required,
          label: f.label,
        })),
      })
      toast({ title: 'Template saved' })
    } catch (error) {
      toast({
        title: 'Failed to save template',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="E-Signature template"
        title={template.name}
        description={`${template.documents.length} document${template.documents.length === 1 ? '' : 's'} · roles: ${roles.map((r) => r.label).join(', ')}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/esign/templates">
                <ArrowLeft className="mr-1.5 size-4" /> Templates
              </Link>
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={updateTemplate.isPending}>
              {updateTemplate.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              Save fields
            </Button>
            <Button onClick={() => router.push(`/dashboard/esign/new?template=${template.id}`)}>
              <Send className="mr-1.5 size-4" /> Use template
            </Button>
          </div>
        }
      />

      {documentUrlsQuery.isLoading || !documentUrlsQuery.data ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-16 text-foreground-muted">
          <Loader2 className="mr-2 size-4 animate-spin" /> Preparing documents…
        </div>
      ) : (
        <PdfFieldEditor
          documents={template.documents.map((d) => ({
            id: d.id,
            name: d.original_filename,
            url: documentUrlsQuery.data[d.id],
            pageCount: d.page_count,
          }))}
          participants={roles}
          fields={editorFields}
          onChange={setEditorFields}
        />
      )}
    </div>
  )
}
