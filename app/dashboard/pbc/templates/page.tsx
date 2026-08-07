'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, FileText, Library, Loader2, Pencil,
  Plus, Search, Trash2,
} from 'lucide-react'

import { useToast } from '@/hooks/use-toast'
import { pbcApi } from '@/lib/pbc/api'
import type { PbcEngagementType, PbcTemplate, PbcTemplateItem } from '@/lib/pbc/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type TemplateItemDraft = Omit<PbcTemplateItem, 'expected_formats'> & { expected_formats: string }
type TemplateDraft = {
  name: string
  description: string
  engagement_type: PbcEngagementType
  items: TemplateItemDraft[]
}

const engagementTypes: Array<{ value: PbcEngagementType; label: string }> = [
  { value: 'audit', label: 'Audit' },
  { value: 'tax', label: 'Tax' },
  { value: 'bookkeeping', label: 'Bookkeeping' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'other', label: 'Other' },
]

const emptyDraft = (): TemplateDraft => ({ name: '', description: '', engagement_type: 'audit', items: [] })
const emptyItem = (): TemplateItemDraft => ({
  request_number: null,
  category: 'Other',
  title: '',
  description: null,
  priority: 'normal',
  expected_filename: null,
  expected_formats: '',
  gl_account: null,
  gl_balance: null,
  sensitive: false,
  requires_redaction: false,
  external_source_id: null,
})

function draftFromTemplate(template: PbcTemplate): TemplateDraft {
  return {
    name: template.name,
    description: template.description || '',
    engagement_type: template.engagement_type,
    items: template.items.map((item) => ({
      ...emptyItem(),
      ...item,
      expected_formats: (item.expected_formats || []).join(', '),
    })),
  }
}

function templatePayload(draft: TemplateDraft): Omit<PbcTemplate, 'id' | 'created_at' | 'updated_at'> {
  const optional = (value: string | null | undefined) => value?.trim() || null
  return {
    name: draft.name.trim(),
    description: optional(draft.description),
    engagement_type: draft.engagement_type,
    items: draft.items.map((item) => ({
      request_number: optional(item.request_number),
      category: optional(item.category),
      title: item.title.trim(),
      description: optional(item.description),
      priority: item.priority,
      expected_filename: optional(item.expected_filename),
      expected_formats: Array.from(new Set(item.expected_formats.split(/[,;]+/).map((value) => value.trim().toLowerCase().replace(/^\./, '')).filter(Boolean))),
      gl_account: optional(item.gl_account),
      gl_balance: optional(item.gl_balance),
      sensitive: item.sensitive,
      requires_redaction: item.requires_redaction,
      external_source_id: optional(item.external_source_id),
    })),
  }
}

export default function PbcTemplatesPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['pbc', 'templates'], queryFn: pbcApi.templates })
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<TemplateDraft>(emptyDraft)
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const [validationError, setValidationError] = React.useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = templatePayload(draft)
      if (!payload.name) throw new Error('Enter a template name.')
      if (payload.items.some((item) => !item.title)) throw new Error('Every request needs a title.')
      const numbers = payload.items.map((item) => item.request_number?.toLowerCase()).filter(Boolean)
      if (new Set(numbers).size !== numbers.length) throw new Error('Request numbers must be unique within a template.')
      return editingId ? pbcApi.updateTemplate(editingId, payload) : pbcApi.createTemplate(payload)
    },
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ['pbc', 'templates'] })
      setOpen(false)
      toast({
        title: editingId ? 'Template updated' : 'Template created',
        description: `${template.name} is ready to use for new PBC engagements.`,
      })
    },
    onError: (error: Error) => setValidationError(error.message),
  })

  const openNew = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setSelectedIndex(null)
    setValidationError(null)
    setOpen(true)
  }

  const openTemplate = (template: PbcTemplate) => {
    setEditingId(template.id)
    setDraft(draftFromTemplate(template))
    setSelectedIndex(template.items.length ? 0 : null)
    setValidationError(null)
    setOpen(true)
  }

  const duplicateTemplate = (template: PbcTemplate) => {
    setEditingId(null)
    setDraft({ ...draftFromTemplate(template), name: `${template.name} copy` })
    setSelectedIndex(template.items.length ? 0 : null)
    setValidationError(null)
    setOpen(true)
  }

  const templates = (query.data?.templates || []).filter((template) =>
    `${template.name} ${template.description || ''} ${template.engagement_type}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/dashboard/pbc" className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"><ArrowLeft className="size-4" />PBC workspace</Link>
          <h1 className="mt-3 text-2xl font-semibold">Request-list templates</h1>
          <p className="mt-1 text-sm text-foreground-muted">Create reusable request lists and configure the evidence expected for every item.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 size-4" />New template</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" />
      </div>

      {query.isLoading && <div className="flex min-h-48 items-center justify-center rounded-xl border"><Loader2 className="mr-2 size-4 animate-spin" /><span className="text-sm text-foreground-muted">Loading templates…</span></div>}
      {query.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{query.error.message}</div>}

      {!query.isLoading && !query.error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="flex min-h-56 flex-col rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Library className="size-4" /></div>
                <Badge variant="secondary">{engagementTypes.find((item) => item.value === template.engagement_type)?.label || template.engagement_type}</Badge>
              </div>
              <h2 className="mt-4 font-semibold">{template.name}</h2>
              <p className="mt-1 line-clamp-3 text-sm text-foreground-muted">{template.description || 'Reusable PBC request list'}</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{template.items.length} request{template.items.length === 1 ? '' : 's'}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => duplicateTemplate(template)} aria-label={`Duplicate ${template.name}`}><Copy className="size-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => openTemplate(template)}><Pencil className="mr-2 size-3.5" />Configure</Button>
                </div>
              </div>
            </article>
          ))}
          {templates.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center md:col-span-2 xl:col-span-3"><Library className="mx-auto size-8 text-foreground-muted" /><p className="mt-3 font-medium">{search ? 'No matching templates' : 'No templates yet'}</p><p className="mt-1 text-sm text-foreground-muted">{search ? 'Try a different search.' : 'Create a reusable request list to get started.'}</p>{!search && <Button className="mt-4" variant="outline" onClick={openNew}><Plus className="mr-2 size-4" />New template</Button>}</div>}
        </div>
      )}

      <TemplateEditor
        open={open}
        editing={!!editingId}
        draft={draft}
        setDraft={setDraft}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        saving={save.isPending}
        error={validationError}
        onOpenChange={(next) => { if (!save.isPending) setOpen(next) }}
        onSave={() => { setValidationError(null); save.mutate() }}
      />
    </div>
  )
}

function TemplateEditor({ open, editing, draft, setDraft, selectedIndex, setSelectedIndex, saving, error, onOpenChange, onSave }: {
  open: boolean
  editing: boolean
  draft: TemplateDraft
  setDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>
  selectedIndex: number | null
  setSelectedIndex: React.Dispatch<React.SetStateAction<number | null>>
  saving: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const selected = selectedIndex === null ? null : draft.items[selectedIndex]
  const updateSelected = (patch: Partial<TemplateItemDraft>) => {
    if (selectedIndex === null) return
    setDraft((current) => ({ ...current, items: current.items.map((item, index) => index === selectedIndex ? { ...item, ...patch } : item) }))
  }
  const addItem = () => {
    const index = draft.items.length
    setDraft((current) => ({ ...current, items: [...current.items, emptyItem()] }))
    setSelectedIndex(index)
  }
  const copyItem = () => {
    if (!selected) return
    const copy = { ...selected, request_number: null, title: selected.title ? `${selected.title} copy` : '' }
    setDraft((current) => ({ ...current, items: [...current.items, copy] }))
    setSelectedIndex(draft.items.length)
  }
  const removeItem = () => {
    if (selectedIndex === null) return
    const nextLength = draft.items.length - 1
    setDraft((current) => ({ ...current, items: current.items.filter((_, index) => index !== selectedIndex) }))
    setSelectedIndex(nextLength === 0 ? null : Math.min(selectedIndex, nextLength - 1))
  }
  const moveItem = (direction: -1 | 1) => {
    if (selectedIndex === null) return
    const target = selectedIndex + direction
    if (target < 0 || target >= draft.items.length) return
    setDraft((current) => {
      const items = [...current.items]
      ;[items[selectedIndex], items[target]] = [items[target], items[selectedIndex]]
      return { ...current, items }
    })
    setSelectedIndex(target)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{editing ? 'Configure PBC template' : 'Create PBC template'}</DialogTitle>
          <DialogDescription>Set the template details, then add and arrange the requests that will be copied into new engagements.</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5">
          <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2"><Label htmlFor="pbc-template-name">Template name</Label><Input id="pbc-template-name" required maxLength={255} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Year-end audit request list" /></div>
            <div className="space-y-2"><Label>Engagement type</Label><Select value={draft.engagement_type} onValueChange={(value) => setDraft((current) => ({ ...current, engagement_type: value as PbcEngagementType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{engagementTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="pbc-template-description">Description</Label><Textarea id="pbc-template-description" rows={2} maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="When should your team use this request list?" /></div>
          </section>

          <section className="mt-6 overflow-hidden rounded-xl border lg:grid lg:min-h-[480px] lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b bg-surface-muted/40 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b p-4"><div><h3 className="text-sm font-semibold">Requests</h3><p className="text-xs text-foreground-muted">{draft.items.length} configured</p></div><Button size="sm" onClick={addItem}><Plus className="mr-1.5 size-3.5" />Add</Button></div>
              <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[420px]">
                {draft.items.length === 0 && <button type="button" onClick={addItem} className="w-full rounded-lg border border-dashed p-6 text-center text-sm text-foreground-muted hover:bg-surface-muted"><FileText className="mx-auto mb-2 size-6" />Add the first request</button>}
                {draft.items.map((item, index) => <button type="button" key={index} onClick={() => setSelectedIndex(index)} className={`mb-1 flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${selectedIndex === index ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-muted'}`}><span className={`mt-0.5 font-mono text-xs ${selectedIndex === index ? 'text-primary-foreground/70' : 'text-foreground-muted'}`}>{item.request_number || String(index + 1).padStart(3, '0')}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title || 'Untitled request'}</span><span className={`block truncate text-xs ${selectedIndex === index ? 'text-primary-foreground/70' : 'text-foreground-muted'}`}>{item.category || 'Uncategorized'}</span></span></button>)}
              </div>
            </div>

            <div className="p-5">
              {!selected && <div className="flex h-full min-h-64 flex-col items-center justify-center text-center"><FileText className="size-8 text-foreground-muted" /><h3 className="mt-3 font-medium">No request selected</h3><p className="mt-1 max-w-sm text-sm text-foreground-muted">Add a request to define what the client should provide.</p></div>}
              {selected && <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Request {selectedIndex! + 1}</h3><p className="text-xs text-foreground-muted">Configure the reusable evidence instructions.</p></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => moveItem(-1)} disabled={selectedIndex === 0} aria-label="Move request up"><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" onClick={() => moveItem(1)} disabled={selectedIndex === draft.items.length - 1} aria-label="Move request down"><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" onClick={copyItem} aria-label="Duplicate request"><Copy className="size-4" /></Button><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={removeItem} aria-label="Delete request"><Trash2 className="size-4" /></Button></div></div>
                <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]"><div className="space-y-2"><Label htmlFor="template-request-number">Request number</Label><Input id="template-request-number" maxLength={64} value={selected.request_number || ''} onChange={(event) => updateSelected({ request_number: event.target.value })} placeholder="Auto" /></div><div className="space-y-2"><Label htmlFor="template-request-category">Category</Label><Input id="template-request-category" maxLength={128} value={selected.category || ''} onChange={(event) => updateSelected({ category: event.target.value })} placeholder="Cash" /></div></div>
                <div className="space-y-2"><Label htmlFor="template-request-title">Title</Label><Input id="template-request-title" required maxLength={500} value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} placeholder="Year-end bank statements and reconciliations" /></div>
                <div className="space-y-2"><Label htmlFor="template-request-description">Client instructions</Label><Textarea id="template-request-description" rows={3} maxLength={20000} value={selected.description || ''} onChange={(event) => updateSelected({ description: event.target.value })} placeholder="Describe the scope, cutoff, and preparation instructions." /></div>
                <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Priority</Label><Select value={selected.priority} onValueChange={(value) => updateSelected({ priority: value as PbcTemplateItem['priority'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="template-request-formats">Expected formats</Label><Input id="template-request-formats" value={selected.expected_formats} onChange={(event) => updateSelected({ expected_formats: event.target.value })} placeholder="xlsx, csv, pdf" /></div><div className="space-y-2"><Label htmlFor="template-request-filename">Expected filename</Label><Input id="template-request-filename" maxLength={500} value={selected.expected_filename || ''} onChange={(event) => updateSelected({ expected_filename: event.target.value })} placeholder="bank_reconciliation.xlsx" /></div><div className="space-y-2"><Label htmlFor="template-request-source">External source ID</Label><Input id="template-request-source" maxLength={255} value={selected.external_source_id || ''} onChange={(event) => updateSelected({ external_source_id: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-request-gl">GL account</Label><Input id="template-request-gl" maxLength={128} value={selected.gl_account || ''} onChange={(event) => updateSelected({ gl_account: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-request-balance">Expected GL balance</Label><Input id="template-request-balance" maxLength={64} value={selected.gl_balance || ''} onChange={(event) => updateSelected({ gl_balance: event.target.value })} /></div></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-0.5 size-4" type="checkbox" checked={selected.sensitive} onChange={(event) => updateSelected({ sensitive: event.target.checked })} /><span><span className="block font-medium">Sensitive evidence</span><span className="text-xs text-foreground-muted">Flag for heightened handling.</span></span></label><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-0.5 size-4" type="checkbox" checked={selected.requires_redaction} onChange={(event) => updateSelected({ requires_redaction: event.target.checked })} /><span><span className="block font-medium">Redaction required</span><span className="text-xs text-foreground-muted">Prompt the client to redact protected data.</span></span></label></div>
              </div>}
            </div>
          </section>
          {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={onSave} disabled={saving || !draft.name.trim()}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}{editing ? 'Save changes' : 'Create template'}</Button></div>
      </DialogContent>
    </Dialog>
  )
}
