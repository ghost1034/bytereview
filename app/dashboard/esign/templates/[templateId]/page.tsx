'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, History, Loader2, Plus, Send, Settings2, Trash2, UploadCloud, X } from 'lucide-react'

import {
  PdfFieldEditor,
  coerceEditorProperties,
  type EditorField,
  type EditorFieldType,
} from '@/components/esign/editor/PdfFieldEditor'
import { ComposerShell, type ComposerSaveState } from '@/components/esign/composer/ComposerShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useEsignBrands, useEsignTemplate, useUpdateEsignTemplate } from '@/hooks/useEnvelopes'
import { usePublishTemplate, useTemplateVersions } from '@/hooks/useEsignScale'
import { apiClient, type EsignTemplateFieldInput, type EsignTemplateRoleInput } from '@/lib/api'
import { cn } from '@/lib/utils'

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
  const queryClient = useQueryClient()

  const templateQuery = useEsignTemplate(templateId)
  const updateTemplate = useUpdateEsignTemplate(templateId!)
  const publishTemplate = usePublishTemplate()
  const versions = useTemplateVersions(templateId)
  const brands = useEsignBrands()
  const template = templateQuery.data

  const [editorFields, setEditorFields] = React.useState<EditorField[]>([])
  const [hydratedFor, setHydratedFor] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<ComposerSaveState>('idle')
  const lastSaved = React.useRef('')
  const queuedSnapshot = React.useRef('')
  const draftRevision = React.useRef(1)
  const saveQueue = React.useRef<Promise<boolean>>(Promise.resolve(true))
  const [name, setName] = React.useState(''); const [description, setDescription] = React.useState('')
  const [title, setTitle] = React.useState(''); const [message, setMessage] = React.useState('')
  const [signingType, setSigningType] = React.useState('sequential'); const [dateFormat, setDateFormat] = React.useState('MM/DD/YYYY')
  const [brandId, setBrandId] = React.useState('none'); const [roleDrafts, setRoleDrafts] = React.useState<EsignTemplateRoleInput[]>([])
  const [configOpen, setConfigOpen] = React.useState(true); const [documentsBusy, setDocumentsBusy] = React.useState(false)

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
    setName(template.name); setDescription(template.description ?? ''); setTitle(template.title ?? ''); setMessage(template.message ?? '')
    setSigningType(template.signing_type); setDateFormat(template.date_format); setBrandId(template.brand_id ?? 'none')
    setRoleDrafts((template.recipient_roles as EsignTemplateRoleInput[]).map(role => ({ ...role })))
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

  const roles = (roleDrafts.length ? roleDrafts : ((template?.recipient_roles as EsignTemplateRoleInput[] | undefined) ?? [])).map(
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

  const saveConfiguration = async () => {
    if (!template || !await handleSave()) return
    try {
      const saved = await updateTemplate.mutateAsync({ expected_revision: draftRevision.current, name: name.trim(), description, title, message, signing_type: signingType, date_format: dateFormat as 'MM/DD/YYYY', brand_id: brandId === 'none' ? null : brandId, recipient_roles: roleDrafts })
      draftRevision.current = saved.draft_revision; toast({ title: 'Template settings saved' })
    } catch (error) { toast({ title: 'Could not save template settings', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  const refreshTemplate = async (savedRevision?: number) => {
    if (savedRevision) draftRevision.current = savedRevision
    await queryClient.invalidateQueries({ queryKey: ['esign', 'template', templateId] })
    await queryClient.invalidateQueries({ queryKey: ['esign', 'template-doc-urls', templateId] })
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
    <ComposerShell title={template.name} stage="fields" saveState={saveState} onClose={() => router.push('/dashboard/esign/templates')} primary={<div className="flex gap-2"><Button variant="outline" onClick={() => setConfigOpen(value => !value)}><Settings2 className="mr-1.5 size-4" /> Settings</Button><Button variant="outline" disabled={publishTemplate.isPending || !!template.archived_at} onClick={async () => { try { if (!await handleSave()) return; const version = await publishTemplate.mutateAsync({ templateId: template.id, expectedRevision: draftRevision.current }); toast({ title: `Version ${version.version} published`, description: 'Bulk jobs and PowerForms can now pin this immutable version.' }) } catch (error) { toast({ title: 'Publish failed', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}><UploadCloud className="mr-1.5 size-4" /> Publish</Button><Button disabled={!!template.archived_at} onClick={async () => { if (await handleSave()) router.push(`/dashboard/esign/new?template=${template.id}`) }}><Send className="mr-1.5 size-4" /> Use template</Button></div>}>
      <div className="space-y-4 p-3 sm:p-4">
      {template.archived_at && <p className="rounded-md border border-warning/30 bg-warning-soft p-3 text-sm">This template is archived because retained envelopes or published versions reference it. Its version history remains immutable.</p>}
      {configOpen && <section className="space-y-5 rounded-lg border border-border bg-surface p-4"><div className="flex items-center gap-2"><Settings2 className="size-4 text-primary" /><h2 className="font-semibold">Template draft settings</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><div><Label>Name</Label><Input value={name} onChange={event => setName(event.target.value)} /></div><div><Label>Default envelope title</Label><Input value={title} onChange={event => setTitle(event.target.value)} /></div><div><Label>Description</Label><Input value={description} onChange={event => setDescription(event.target.value)} /></div><div><Label>Signing order</Label><Select value={signingType} onValueChange={setSigningType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sequential">Sequential</SelectItem><SelectItem value="parallel">Any order</SelectItem></SelectContent></Select></div><div><Label>Date format</Label><Select value={dateFormat} onValueChange={setDateFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM D, YYYY'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label>Brand</Label><Select value={brandId} onValueChange={setBrandId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Firm default</SelectItem>{brands.data?.brands.filter(brand => brand.active).map(brand => <SelectItem key={String(brand.id)} value={String(brand.id)}>{String(brand.name)}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2 lg:col-span-3"><Label>Default message</Label><Textarea value={message} onChange={event => setMessage(event.target.value)} /></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label>Recipient roles and relationships</Label><Button size="sm" variant="outline" onClick={() => setRoleDrafts(current => [...current, { id: crypto.randomUUID(), label: `Recipient ${current.length + 1}`, role: 'signer', routing_order: current.length + 1, allow_reassignment: false }])}><Plus className="mr-1 size-3" /> Add role</Button></div>{roleDrafts.map((role, index) => <div key={role.id ?? index} className={cn('grid gap-2 rounded-md border p-3', signingType === 'sequential' ? 'md:grid-cols-[1fr_150px_100px_1fr_auto]' : 'md:grid-cols-[1fr_150px_1fr_auto]')}><Input value={role.label} onChange={event => setRoleDrafts(current => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /><Select value={role.role} onValueChange={value => setRoleDrafts(current => current.map((item, i) => i === index ? { ...item, role: value as EsignTemplateRoleInput['role'] } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['signer', 'cc', 'approver', 'certified_delivery', 'agent', 'editor', 'witness', 'in_person_signer'].map(value => <SelectItem key={value} value={value}>{value.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select>{signingType === 'sequential' && <Input aria-label={`Routing step for ${role.label || `recipient ${index + 1}`}`} type="number" min={1} value={role.routing_order} onChange={event => setRoleDrafts(current => current.map((item, i) => i === index ? { ...item, routing_order: Number(event.target.value) } : item))} />}<Select value={role.managed_by_role_id ?? 'none'} onValueChange={value => setRoleDrafts(current => current.map((item, i) => i === index ? { ...item, managed_by_role_id: value === 'none' ? undefined : value } : item))}><SelectTrigger><SelectValue placeholder="Managed by" /></SelectTrigger><SelectContent><SelectItem value="none">No manager</SelectItem>{roleDrafts.filter((_, i) => i !== index).map((candidate, i) => <SelectItem key={candidate.id ?? i} value={candidate.id ?? String(i)}>{candidate.label}</SelectItem>)}</SelectContent></Select><Button size="icon" variant="ghost" disabled={roleDrafts.length === 1 || template.fields.some(field => field.recipient_role_id === role.id)} onClick={() => setRoleDrafts(current => current.filter((_, i) => i !== index))}><X className="size-4" /></Button></div>)}</div>
        <div><div className="flex items-center justify-between"><Label>Documents</Label><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm"><FilePlus2 className="mr-1 size-3" /> Add PDFs<input className="sr-only" type="file" accept=".pdf,application/pdf" multiple onChange={async event => { const files = Array.from(event.target.files ?? []); if (!files.length) return; setDocumentsBusy(true); try { const saved = await apiClient.addEsignTemplateDocuments(template.id, files); await refreshTemplate(saved.draft_revision); toast({ title: 'Documents added' }) } catch (error) { toast({ title: 'Could not add documents', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } finally { setDocumentsBusy(false); event.target.value = '' } }} /></label></div><div className="mt-2 flex flex-wrap gap-2">{template.documents.map(document => <span key={document.id} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">{document.original_filename}<button disabled={documentsBusy || template.documents.length === 1} onClick={async () => { setDocumentsBusy(true); try { const saved = await apiClient.deleteEsignTemplateDocument(template.id, document.id); await refreshTemplate(saved.draft_revision); toast({ title: 'Document removed' }) } catch (error) { toast({ title: 'Could not remove document', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } finally { setDocumentsBusy(false) } }}><Trash2 className="size-3 text-foreground-muted" /></button></span>)}</div></div>
        <div className="flex justify-end"><Button onClick={() => void saveConfiguration()} disabled={!name.trim() || !roleDrafts.length || updateTemplate.isPending}>Save settings</Button></div></section>}
      <section className="rounded-lg border border-border bg-surface p-4"><div className="mb-3 flex items-center gap-2"><History className="size-4 text-primary" /><h2 className="font-semibold">Immutable published versions</h2></div>{versions.data?.versions.length ? <div className="flex flex-wrap gap-2">{versions.data.versions.map(version => <div key={version.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"><span>Version {version.version} · {new Date(version.published_at).toLocaleString()}</span><Button size="sm" variant="ghost" onClick={async () => { try { const draft = await apiClient.createEsignTemplateDraftFromVersion(version.id); toast({ title: `Draft created from version ${version.version}` }); router.push(`/dashboard/esign/templates/${draft.id}`) } catch (error) { toast({ title: 'Could not create draft', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Create draft</Button></div>)}</div> : <p className="text-sm text-foreground-muted">No published versions yet.</p>}</section>
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
