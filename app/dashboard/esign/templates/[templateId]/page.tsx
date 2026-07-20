'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Send, UploadCloud } from 'lucide-react'

import {
  PdfFieldEditor,
  coerceEditorProperties,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import { ComposerShell, type ComposerSaveState } from '@/components/esign/composer/ComposerShell'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useEsignTemplate, useUpdateEsignTemplate } from '@/hooks/useEnvelopes'
import { usePublishTemplate } from '@/hooks/useEsignScale'
import { apiClient, type EsignTemplateFieldInput } from '@/lib/api'

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
  const publishTemplate = usePublishTemplate()
  const template = templateQuery.data

  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<ComposerSaveState>('idle')
  const lastSaved = React.useRef('')
  const queuedSnapshot = React.useRef('')
  const draftRevision = React.useRef(1)
  const saveQueue = React.useRef<Promise<boolean>>(Promise.resolve(true))

  React.useEffect(() => {
    if (!template || hydratedFor === template.id) return
    const initial = template.fields.map((f) => ({
        id: f.id,
        documentId: f.template_document_id,
        participantId: f.recipient_role_id ?? String(f.recipient_index),
        fieldType: f.field_type as EditorFieldType,
        pageNumber: f.page_number,
        posX: f.pos_x,
        posY: f.pos_y,
        width: f.width,
        height: f.height,
        required: f.required,
        label: f.label ?? undefined,
        properties: coerceEditorProperties(f.properties),
      }))
    setEditorFields(initial)
    lastSaved.current = JSON.stringify(initial)
    draftRevision.current = template.draft_revision
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

  const roles = ((template?.recipient_roles as { id?: string; label?: string; role?: string }[] | undefined) ?? []).map(
    (role, index) => ({ role, index }),
  ).filter(({ role }) => ['signer', 'witness', 'in_person_signer'].includes(role.role ?? 'signer')).map(
    ({ role, index }) => ({
      id: role.id ?? String(index),
      label: role.label || `Signer ${index + 1}`,
    }),
  )

  const handleSave = async () => {
    if (!template) return false
    const snapshot = JSON.stringify(editorFields)
    if (snapshot === lastSaved.current) return true
    if (snapshot === queuedSnapshot.current) return saveQueue.current
    queuedSnapshot.current = snapshot
    const fields = editorFields.map((field) => ({ ...field, properties: structuredClone(field.properties ?? {}) }))
    const operation = saveQueue.current.catch(() => false).then(async () => {
      setSaveState('saving')
      try {
        const saved = await updateTemplate.mutateAsync({
        expected_revision: draftRevision.current,
        fields: fields.map((f) => {
          const roleIndex = (template.recipient_roles as { id?: string }[])
            .findIndex((role) => role.id === f.participantId)
          const legacyIndex = Number.parseInt(f.participantId, 10)
          return {
            id: f.id,
            template_document_id: f.documentId,
            recipient_index: roleIndex >= 0 ? roleIndex : Math.max(0, Number.isNaN(legacyIndex) ? 0 : legacyIndex),
            recipient_role_id: roleIndex >= 0 ? f.participantId : undefined,
            field_type: f.fieldType,
            page_number: f.pageNumber,
            pos_x: f.posX,
            pos_y: f.posY,
            width: f.width,
            height: f.height,
            required: f.required,
            label: f.label,
            properties: f.properties as EsignTemplateFieldInput['properties'],
          }
        }),
        })
        draftRevision.current = saved.draft_revision
        lastSaved.current = snapshot
        if (queuedSnapshot.current === snapshot) setSaveState('saved')
        return true
      } catch (error) {
        setSaveState('error')
        toast({
          title: 'Failed to save template',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
        return false
      }
    })
    saveQueue.current = operation
    return operation
  }

  React.useEffect(() => {
    if (!hydratedFor || JSON.stringify(editorFields) === lastSaved.current) return
    const timer = window.setTimeout(() => { void handleSave() }, 750)
    return () => window.clearTimeout(timer)
    // handleSave intentionally follows the current editor field collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorFields, hydratedFor])

  if (templateQuery.isLoading || !template) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <ComposerShell title={template.name} stage="fields" saveState={saveState} onClose={() => router.push('/dashboard/esign/templates')} primary={<div className="flex gap-2"><Button variant="outline" disabled={publishTemplate.isPending} onClick={async () => { try { if (!await handleSave()) return; const version = await publishTemplate.mutateAsync({ templateId: template.id, expectedRevision: draftRevision.current }); toast({ title: `Version ${version.version} published`, description: 'Bulk jobs and PowerForms can now pin this immutable version.' }) } catch (error) { toast({ title: 'Publish failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><UploadCloud className="mr-1.5 size-4" /> Publish</Button><Button onClick={async () => { if (await handleSave()) router.push(`/dashboard/esign/new?template=${template.id}`) }}><Send className="mr-1.5 size-4" /> Use template</Button></div>}>
      <div className="p-3 sm:p-4">
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
          onAnchorSearch={(request) => apiClient.searchEsignTemplateAnchors(template.id, request)}
        />
      )}
      </div>
    </ComposerShell>
  )
}
