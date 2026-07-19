'use client'

import * as React from 'react'
import {
  Calculator, CalendarDays, CheckSquare, CircleDot, Copy,
  ListChecks, Loader2, Paperclip, PenLine, Redo2, Search, Trash2, Type, Undo2, UserRound,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { validateFormula } from '@/lib/esign/fieldLogic'
import { openPdfFromUrl, participantColor, type PdfDocument } from '../pdf'
import { PdfPageCanvas } from '../PdfPageCanvas'
import { AlignmentGuides } from './AlignmentGuides'
import { snapRect, type SnapGuide } from './snapping'

export type EditorFieldType =
  | 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox'
  | 'auto_fill' | 'attachment' | 'radio' | 'dropdown' | 'formula'

export interface EditorDocument { id: string; name: string; url: string; pageCount: number }
export interface EditorParticipant { id: string; label: string }
export interface EditorFieldProperties {
  group?: { id: string; label?: string }
  option_value?: string
  options?: Array<{ value: string; label: string }>
  auto_source?: 'recipient_name' | 'recipient_email' | 'company' | 'date_sent'
  formula?: { expression: string; decimal_places: number }
  conditional?: {
    parent_field_id: string
    operator: 'equals' | 'not_equals' | 'any_of' | 'checked' | 'unchecked' | 'not_empty'
    values?: string[]
    action: 'show' | 'require'
  }
  anchor?: { text: string; offset_x: number; offset_y: number }
  allowed_types?: string[]
  [key: string]: unknown
}

export function coerceEditorProperties(value: unknown): EditorFieldProperties {
  return (value && typeof value === 'object' ? value : {}) as EditorFieldProperties
}
export interface EditorField {
  id: string
  documentId: string
  participantId: string
  fieldType: EditorFieldType
  pageNumber: number
  posX: number
  posY: number
  width: number
  height: number
  required: boolean
  label?: string
  properties?: EditorFieldProperties
}

interface PdfFieldEditorProps {
  documents: EditorDocument[]
  participants: EditorParticipant[]
  fields: EditorField[]
  onChange: (fields: EditorField[]) => void
  className?: string
}

const FIELD_TYPES: Array<{ type: EditorFieldType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { type: 'signature', label: 'Signature', icon: PenLine },
  { type: 'initials', label: 'Initials', icon: Type },
  { type: 'date_signed', label: 'Date signed', icon: CalendarDays },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'radio', label: 'Radio group', icon: CircleDot },
  { type: 'dropdown', label: 'Dropdown', icon: ListChecks },
  { type: 'attachment', label: 'Attachment', icon: Paperclip },
  { type: 'formula', label: 'Formula', icon: Calculator },
  { type: 'auto_fill', label: 'Auto-fill', icon: UserRound },
]

const DEFAULT_SIZES: Record<EditorFieldType, { width: number; height: number }> = {
  signature: { width: 0.28, height: 0.045 }, initials: { width: 0.08, height: 0.035 },
  date_signed: { width: 0.16, height: 0.03 }, text: { width: 0.24, height: 0.03 },
  checkbox: { width: 0.03, height: 0.022 }, radio: { width: 0.03, height: 0.022 },
  dropdown: { width: 0.24, height: 0.035 }, attachment: { width: 0.28, height: 0.04 },
  formula: { width: 0.2, height: 0.03 }, auto_fill: { width: 0.24, height: 0.03 },
}

const SHORT: Record<EditorFieldType, string> = {
  signature: 'Sign', initials: 'Initials', date_signed: 'Date', text: 'Text', checkbox: '☐',
  radio: '○', dropdown: 'Select ▾', attachment: 'Attach', formula: 'ƒx', auto_fill: 'Auto',
}
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = typeof HANDLES[number]
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const newId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `f_${Math.random().toString(36).slice(2)}`

function defaultProperties(type: EditorFieldType, radioGroup: string | null): EditorFieldProperties {
  if (type === 'radio') return { group: { id: radioGroup ?? newId(), label: 'Choose one' }, option_value: 'Option' }
  if (type === 'dropdown') return { options: [{ value: 'option_1', label: 'Option 1' }] }
  if (type === 'auto_fill') return { auto_source: 'recipient_name' }
  if (type === 'formula') return { formula: { expression: '0', decimal_places: 2 } }
  if (type === 'attachment') return { allowed_types: ['application/pdf', 'image/png', 'image/jpeg'] }
  return {}
}

function PropertiesPanel({ field, fields, update, remove }: {
  field: EditorField
  fields: EditorField[]
  update: (patch: Partial<EditorField>) => void
  remove: () => void
}) {
  const properties = field.properties ?? {}
  const setProperties = (patch: Partial<EditorFieldProperties>) => update({ properties: { ...properties, ...patch } })
  const conditional = properties.conditional
  const [formulaError, setFormulaError] = React.useState('')
  return <div className="space-y-2 rounded-md border border-border bg-surface p-3 text-sm">
    <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Field properties</p>
    <input className="w-full rounded border border-border bg-background px-2 py-1" value={field.label ?? ''}
      onChange={(event) => update({ label: event.target.value })} placeholder="Label" />
    {!['signature', 'initials', 'date_signed', 'formula'].includes(field.fieldType) && <label className="flex gap-2">
      <input type="checkbox" checked={field.required} onChange={(event) => update({ required: event.target.checked })} /> Required
    </label>}
    {field.fieldType === 'auto_fill' && <label className="block">Source
      <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1" value={properties.auto_source ?? 'recipient_name'}
        onChange={(event) => setProperties({ auto_source: event.target.value as EditorFieldProperties['auto_source'] })}>
        <option value="recipient_name">Recipient name</option><option value="recipient_email">Recipient email</option>
        <option value="company">Company (editable)</option><option value="date_sent">Date sent</option>
      </select>
    </label>}
    {field.fieldType === 'dropdown' && <label className="block">Options (one per line)
      <textarea className="mt-1 min-h-20 w-full rounded border border-border bg-background px-2 py-1"
        value={(properties.options ?? []).map((option) => option.label).join('\n')}
        onChange={(event) => setProperties({ options: event.target.value.split('\n').filter(Boolean).map((label, index) => ({ value: `option_${index + 1}`, label })) })} />
    </label>}
    {field.fieldType === 'radio' && <>
      <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.group?.label ?? ''}
        onChange={(event) => setProperties({ group: { id: properties.group?.id ?? newId(), label: event.target.value } })} placeholder="Group label" />
      <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.option_value ?? ''}
        onChange={(event) => setProperties({ option_value: event.target.value })} placeholder="Option value" />
    </>}
    {field.fieldType === 'formula' && <label className="block">Expression
      <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1 font-mono" value={properties.formula?.expression ?? ''}
        onChange={(event) => setProperties({ formula: { decimal_places: properties.formula?.decimal_places ?? 2, expression: event.target.value } })}
        onBlur={(event) => { try { validateFormula(event.target.value); setFormulaError('') } catch (error) { setFormulaError(error instanceof Error ? error.message : 'Invalid formula') } }} />
      <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1" value=""
        onChange={(event) => {
          if (!event.target.value) return
          setProperties({ formula: { decimal_places: properties.formula?.decimal_places ?? 2, expression: `${properties.formula?.expression ?? ''}[${event.target.value}]` } })
        }}>
        <option value="">Insert field reference…</option>
        {fields.filter((item) => item.id !== field.id && !['signature', 'initials', 'attachment'].includes(item.fieldType)).map((item) => <option key={item.id} value={item.id}>{item.label || SHORT[item.fieldType]}</option>)}
      </select>
      {formulaError && <span className="text-xs text-destructive">{formulaError}</span>}
    </label>}
    <label className="block">Conditional behavior
      <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
        value={conditional ? conditional.action : 'none'} onChange={(event) => {
          if (event.target.value === 'none') setProperties({ conditional: undefined })
          else setProperties({ conditional: { parent_field_id: fields.find((item) => item.id !== field.id)?.id ?? '', operator: 'not_empty', values: [], action: event.target.value as 'show' | 'require' } })
        }}>
        <option value="none">Always visible</option><option value="show">Show when…</option><option value="require">Require when…</option>
      </select>
    </label>
    {conditional && <>
      <select className="w-full rounded border border-border bg-background px-2 py-1" value={conditional.parent_field_id}
        onChange={(event) => setProperties({ conditional: { ...conditional, parent_field_id: event.target.value } })}>
        {fields.filter((item) => item.id !== field.id && !['signature', 'initials', 'attachment', 'formula'].includes(item.fieldType)).map((item) => <option key={item.id} value={item.id}>{item.label || SHORT[item.fieldType]}</option>)}
      </select>
      <select className="w-full rounded border border-border bg-background px-2 py-1" value={conditional.operator}
        onChange={(event) => setProperties({ conditional: { ...conditional, operator: event.target.value as NonNullable<EditorFieldProperties['conditional']>['operator'] } })}>
        <option value="not_empty">Is not empty</option><option value="equals">Equals</option><option value="not_equals">Does not equal</option>
        <option value="any_of">Any of</option><option value="checked">Checked</option><option value="unchecked">Unchecked</option>
      </select>
      {!['not_empty', 'checked', 'unchecked'].includes(conditional.operator) && <input className="w-full rounded border border-border bg-background px-2 py-1"
        value={(conditional.values ?? []).join(', ')} onChange={(event) => setProperties({ conditional: { ...conditional, values: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) } })} placeholder="Value(s), comma separated" />}
    </>}
    <Button type="button" variant="outline" size="sm" className="w-full text-destructive" onClick={remove}><Trash2 className="mr-1.5 size-3.5" /> Remove</Button>
  </div>
}

export function PdfFieldEditor({ documents, participants, fields, onChange, className }: PdfFieldEditorProps) {
  const [activeDocumentId, setActiveDocumentId] = React.useState(documents[0]?.id)
  const [activeParticipantId, setActiveParticipantId] = React.useState(participants[0]?.id)
  const [armedType, setArmedType] = React.useState<EditorFieldType | null>(null)
  const [radioGroup, setRadioGroup] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [guides, setGuides] = React.useState<SnapGuide[]>([])
  const [marquee, setMarquee] = React.useState<{ page: number; x: number; y: number; width: number; height: number } | null>(null)
  const past = React.useRef<EditorField[][]>([])
  const future = React.useRef<EditorField[][]>([])
  const clipboard = React.useRef<EditorField[]>([])
  const containerRef = React.useRef<HTMLDivElement>(null)
  const activeDocument = documents.find((doc) => doc.id === activeDocumentId) ?? documents[0]
  const participantIndexById = React.useMemo(() => new Map(participants.map((participant, index) => [participant.id, index])), [participants])

  React.useEffect(() => {
    if (!activeDocument) return
    let cancelled = false
    setPdf(null); setLoadError(null)
    openPdfFromUrl(activeDocument.url).then((doc) => { if (!cancelled) setPdf(doc) })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load PDF') })
    return () => { cancelled = true }
  }, [activeDocument])

  const commit = React.useCallback((next: EditorField[], before = fields) => {
    if (next === before) return
    past.current.push(before.map((field) => ({ ...field, properties: structuredClone(field.properties ?? {}) })))
    future.current = []
    onChange(next)
  }, [fields, onChange])
  const undo = React.useCallback(() => {
    const previous = past.current.pop(); if (!previous) return
    future.current.unshift(fields); onChange(previous); setSelectedIds(new Set())
  }, [fields, onChange])
  const redo = React.useCallback(() => {
    const next = future.current.shift(); if (!next) return
    past.current.push(fields); onChange(next); setSelectedIds(new Set())
  }, [fields, onChange])
  const selectedField = fields.find((field) => selectedIds.has(field.id)) ?? null

  const removeSelected = React.useCallback(() => {
    if (!selectedIds.size) return
    const dependents = fields.filter((field) => field.properties?.conditional?.parent_field_id && selectedIds.has(field.properties.conditional.parent_field_id))
    const next = fields.filter((field) => !selectedIds.has(field.id)).map((field) => dependents.includes(field)
      ? { ...field, properties: { ...field.properties, conditional: undefined } } : field)
    commit(next); setSelectedIds(new Set())
  }, [commit, fields, selectedIds])

  const duplicate = React.useCallback((source: EditorField[], offset = 0.016) => {
    if (!source.length) return
    const idMap = new Map(source.map((field) => [field.id, newId()]))
    const fullRadioGroups = new Map<string, string>()
    for (const field of source.filter((item) => item.fieldType === 'radio')) {
      const group = field.properties?.group?.id
      const all = fields.filter((item) => item.fieldType === 'radio' && item.properties?.group?.id === group)
      if (group && all.every((item) => source.some((selected) => selected.id === item.id))) fullRadioGroups.set(group, newId())
    }
    const clones = source.map((field) => {
      const properties = structuredClone(field.properties ?? {})
      if (properties.group?.id && fullRadioGroups.has(properties.group.id)) properties.group.id = fullRadioGroups.get(properties.group.id)!
      if (properties.conditional?.parent_field_id && idMap.has(properties.conditional.parent_field_id)) properties.conditional.parent_field_id = idMap.get(properties.conditional.parent_field_id)!
      if (properties.formula?.expression) for (const [oldId, id] of idMap) properties.formula.expression = properties.formula.expression.split(`[${oldId}]`).join(`[${id}]`)
      return { ...field, id: idMap.get(field.id)!, posX: clamp(field.posX + offset, 0, 1 - field.width), posY: clamp(field.posY + offset, 0, 1 - field.height), properties }
    })
    commit([...fields, ...clones]); setSelectedIds(new Set(clones.map((field) => field.id)))
  }, [commit, fields])

  React.useEffect(() => {
    const node = containerRef.current; if (!node) return
    const handle = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, textarea, select')) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); clipboard.current = fields.filter((field) => selectedIds.has(field.id)); return }
      if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); duplicate(clipboard.current); return }
      if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(fields.filter((field) => selectedIds.has(field.id))); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); return }
      if (event.key === 'Escape') { setArmedType(null); setRadioGroup(null); setSelectedIds(new Set()); return }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selectedIds.size) {
        event.preventDefault(); const scale = event.shiftKey ? 10 : 1; const dx = (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0) * 0.0015 * scale; const dy = (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0) * 0.0015 * scale
        commit(fields.map((field) => selectedIds.has(field.id) ? { ...field, posX: clamp(field.posX + dx, 0, 1 - field.width), posY: clamp(field.posY + dy, 0, 1 - field.height) } : field))
      }
    }
    node.addEventListener('keydown', handle); return () => node.removeEventListener('keydown', handle)
  }, [duplicate, fields, redo, removeSelected, selectedIds, undo, commit])

  const placeField = (pageNumber: number, x: number, y: number) => {
    if (!armedType || !activeDocument || !activeParticipantId) return
    const size = DEFAULT_SIZES[armedType]
    const id = newId()
    const field: EditorField = { id, documentId: activeDocument.id, participantId: activeParticipantId, fieldType: armedType,
      pageNumber, posX: clamp(x - size.width / 2, 0, 1 - size.width), posY: clamp(y - size.height / 2, 0, 1 - size.height),
      width: size.width, height: size.height, required: armedType !== 'formula', properties: defaultProperties(armedType, radioGroup) }
    commit([...fields, field]); setSelectedIds(new Set([id]))
    if (armedType === 'radio') setRadioGroup(field.properties?.group?.id ?? radioGroup)
    else setArmedType(null)
  }

  const drag = React.useRef<null | { mode: 'move' | 'resize'; handle?: Handle; startX: number; startY: number; before: EditorField[]; field: EditorField; selected: Set<string>; pageWidth: number; pageHeight: number }>(null)
  const startInteraction = (event: React.PointerEvent, field: EditorField, mode: 'move' | 'resize', size: { width: number; height: number }, handle?: Handle) => {
    event.preventDefault(); event.stopPropagation(); containerRef.current?.focus()
    const nextSelected = event.shiftKey || event.metaKey || event.ctrlKey
      ? new Set(selectedIds.has(field.id) ? [...selectedIds].filter((id) => id !== field.id) : [...selectedIds, field.id])
      : selectedIds.has(field.id) ? selectedIds : new Set([field.id])
    setSelectedIds(nextSelected); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = { mode, handle, startX: event.clientX, startY: event.clientY, before: fields, field, selected: nextSelected, pageWidth: size.width, pageHeight: size.height }
  }
  const moveInteraction = (event: React.PointerEvent) => {
    const state = drag.current; if (!state) return
    const dx = (event.clientX - state.startX) / state.pageWidth; const dy = (event.clientY - state.startY) / state.pageHeight
    if (state.mode === 'move') {
      const moving = state.before.filter((field) => state.selected.has(field.id) && field.documentId === state.field.documentId && field.pageNumber === state.field.pageNumber)
      const minX = Math.min(...moving.map((field) => field.posX)); const minY = Math.min(...moving.map((field) => field.posY));
      const maxX = Math.max(...moving.map((field) => field.posX + field.width)); const maxY = Math.max(...moving.map((field) => field.posY + field.height))
      let rect = { x: clamp(minX + dx, 0, 1 - (maxX - minX)), y: clamp(minY + dy, 0, 1 - (maxY - minY)), width: maxX - minX, height: maxY - minY }
      if (!event.altKey) {
        const otherRects = state.before.filter((field) => !state.selected.has(field.id) && field.documentId === state.field.documentId && field.pageNumber === state.field.pageNumber).map((field) => ({ x: field.posX, y: field.posY, width: field.width, height: field.height }))
        const snapped = snapRect(rect, otherRects, 6 / state.pageWidth, 6 / state.pageHeight); rect = snapped.rect; setGuides(snapped.guides)
      } else setGuides([])
      const offsetX = rect.x - minX; const offsetY = rect.y - minY
      onChange(state.before.map((field) => moving.includes(field) ? { ...field, posX: field.posX + offsetX, posY: field.posY + offsetY } : field))
    } else {
      const original = state.field; const handle = state.handle ?? 'se'; let x = original.posX, y = original.posY, w = original.width, h = original.height
      if (handle.includes('e')) w += dx; if (handle.includes('s')) h += dy
      if (handle.includes('w')) { x += dx; w -= dx } if (handle.includes('n')) { y += dy; h -= dy }
      if (event.shiftKey && ['signature', 'initials'].includes(original.fieldType)) { const ratio = original.width / original.height; if (Math.abs(dx) > Math.abs(dy)) h = w / ratio; else w = h * ratio }
      w = clamp(w, 0.02, 1 - x); h = clamp(h, 0.012, 1 - y); x = clamp(x, 0, original.posX + original.width - 0.02); y = clamp(y, 0, original.posY + original.height - 0.012)
      onChange(state.before.map((field) => field.id === original.id ? { ...field, posX: x, posY: y, width: w, height: h } : field))
    }
  }
  const endInteraction = () => { const state = drag.current; if (!state) return; past.current.push(state.before); future.current = []; drag.current = null; setGuides([]) }

  const placeByAnchor = async () => {
    if (!pdf || !activeDocument || !activeParticipantId) return
    const anchor = window.prompt('Anchor text to find'); if (!anchor) return
    const type = armedType && !['radio', 'attachment'].includes(armedType) ? armedType : 'text'; const size = DEFAULT_SIZES[type]
    const generated: EditorField[] = []
    for (let pageIndex = 0; pageIndex < pdf.numPages && generated.length < 500; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex + 1); const viewport = page.getViewport({ scale: 1 }); const content = await page.getTextContent()
      for (const item of content.items) {
        if (!('str' in item) || !String(item.str).toLocaleLowerCase().includes(anchor.toLocaleLowerCase())) continue
        const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
        generated.push({ id: newId(), documentId: activeDocument.id, participantId: activeParticipantId, fieldType: type,
          pageNumber: pageIndex, posX: clamp((vx + item.width) / viewport.width, 0, 1 - size.width), posY: clamp(vy / viewport.height, 0, 1 - size.height),
          width: size.width, height: size.height, required: type !== 'formula', properties: { ...defaultProperties(type, null), anchor: { text: anchor, offset_x: item.width / viewport.width, offset_y: 0 } } })
      }
    }
    if (generated.length) { commit([...fields, ...generated]); setSelectedIds(new Set(generated.map((field) => field.id))) }
    else window.alert(`No matches found for “${anchor}”.`)
  }

  if (!documents.length || !participants.length) return <p className="text-sm text-foreground-muted">Add documents and recipients before placing fields.</p>

  return <div ref={containerRef} tabIndex={0} className={cn('flex flex-col gap-4 outline-none lg:flex-row', className)}>
    <aside className="w-full shrink-0 space-y-4 lg:w-64">
      {documents.length > 1 && <Select value={activeDocument?.id} onValueChange={setActiveDocumentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{documents.map((doc) => <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>)}</SelectContent></Select>}
      <div className="space-y-1.5"><p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Assign to</p>{participants.map((participant, index) => {
        const color = participantColor(index); return <button key={participant.id} type="button" onClick={() => setActiveParticipantId(participant.id)}
          className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm', participant.id === activeParticipantId ? 'border-primary bg-primary-soft' : 'border-border bg-surface')}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color.border }} /> <span className="truncate">{participant.label}</span></button>})}</div>
      <div className="space-y-1.5"><p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Fields</p>
        <div className="grid grid-cols-2 gap-1.5">{FIELD_TYPES.map(({ type, label, icon: Icon }) => <button key={type} type="button" title={label}
          onClick={() => { const next = armedType === type ? null : type; setArmedType(next); setRadioGroup(next === 'radio' ? newId() : null) }}
          className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs', armedType === type ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface')}><Icon className="size-3.5" />{label}</button>)}</div>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={placeByAnchor}><Search className="mr-1.5 size-3.5" /> Place by anchor</Button>
        <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={undo} title="Undo"><Undo2 className="size-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={redo} title="Redo"><Redo2 className="size-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={() => duplicate(fields.filter((field) => selectedIds.has(field.id)))} title="Duplicate"><Copy className="size-4" /></Button></div>
        <p className="text-xs text-foreground-subtle">{armedType ? armedType === 'radio' ? 'Click repeatedly to add options; Escape ends the group.' : 'Click a page to place.' : 'Shift/Cmd-click or drag a marquee to multi-select. Alt disables snapping.'}</p>
      </div>
      {selectedField && <PropertiesPanel field={selectedField} fields={fields} update={(patch) => commit(fields.map((field) => field.id === selectedField.id ? { ...field, ...patch } : field))} remove={removeSelected} />}
    </aside>
    <main className={cn('min-w-0 flex-1 space-y-4 rounded-lg bg-surface-muted p-3 sm:p-4', armedType && 'cursor-crosshair')}>
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {!pdf && !loadError && <div className="flex justify-center py-16 text-foreground-muted"><Loader2 className="mr-2 size-4 animate-spin" /> Loading document…</div>}
      {pdf && activeDocument && Array.from({ length: pdf.numPages }, (_, pageIndex) => <div key={pageIndex} className="mx-auto w-full max-w-3xl"><p className="mb-1 text-xs text-foreground-subtle">Page {pageIndex + 1} of {pdf.numPages}</p>
        <PdfPageCanvas pdf={pdf} pageNumber={pageIndex + 1} overlay={(size) => <div className="absolute inset-0" onPointerMove={(event) => {
          if (drag.current) { moveInteraction(event); return } if (!marquee || marquee.page !== pageIndex) return
          const rect = event.currentTarget.getBoundingClientRect(); setMarquee({ ...marquee, width: (event.clientX - rect.left) / rect.width - marquee.x, height: (event.clientY - rect.top) / rect.height - marquee.y })
        }} onPointerUp={() => { if (drag.current) { endInteraction(); return } if (!marquee || marquee.page !== pageIndex) return
          const x0 = Math.min(marquee.x, marquee.x + marquee.width), x1 = Math.max(marquee.x, marquee.x + marquee.width), y0 = Math.min(marquee.y, marquee.y + marquee.height), y1 = Math.max(marquee.y, marquee.y + marquee.height)
          setSelectedIds(new Set(fields.filter((field) => field.documentId === activeDocument.id && field.pageNumber === pageIndex && field.posX >= x0 && field.posY >= y0 && field.posX + field.width <= x1 && field.posY + field.height <= y1).map((field) => field.id))); setMarquee(null)
        }} onPointerDown={(event) => { if (armedType) { const rect = event.currentTarget.getBoundingClientRect(); placeField(pageIndex, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) } else { const rect = event.currentTarget.getBoundingClientRect(); setSelectedIds(new Set()); setMarquee({ page: pageIndex, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, width: 0, height: 0 }) } }}>
          <AlignmentGuides guides={guides} width={size.width} height={size.height} />
          {marquee?.page === pageIndex && <span className="pointer-events-none absolute border border-primary bg-primary/10" style={{ left: Math.min(marquee.x, marquee.x + marquee.width) * size.width, top: Math.min(marquee.y, marquee.y + marquee.height) * size.height, width: Math.abs(marquee.width) * size.width, height: Math.abs(marquee.height) * size.height }} />}
          {fields.filter((field) => field.documentId === activeDocument.id && field.pageNumber === pageIndex).map((field) => { const color = participantColor(participantIndexById.get(field.participantId) ?? 0); const selected = selectedIds.has(field.id); const isConditionalParent = selectedField?.properties?.conditional?.parent_field_id === field.id
            return <div key={field.id} onPointerDown={(event) => startInteraction(event, field, 'move', size)} onPointerMove={moveInteraction} onPointerUp={endInteraction}
              className={cn('absolute flex touch-none select-none items-center justify-center overflow-visible rounded-sm border text-[10px] font-medium', selected && 'ring-2 ring-offset-1', isConditionalParent && 'ring-2 ring-fuchsia-500 ring-offset-1')}
              style={{ left: field.posX * size.width, top: field.posY * size.height, width: field.width * size.width, height: field.height * size.height, borderColor: color.border, backgroundColor: color.bg, color: color.text, cursor: 'move' }}>
              <span className="pointer-events-none truncate px-1">{SHORT[field.fieldType]}</span>{field.properties?.conditional && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-fuchsia-500" />}
              {selected && HANDLES.map((handle) => <span key={handle} onPointerDown={(event) => startInteraction(event, field, 'resize', size, handle)} onPointerMove={moveInteraction} onPointerUp={endInteraction}
                className="absolute size-2 rounded-[1px] border border-white bg-primary" style={{ cursor: `${handle}-resize`, left: handle.includes('w') ? -4 : handle.includes('e') ? 'calc(100% - 4px)' : 'calc(50% - 4px)', top: handle.includes('n') ? -4 : handle.includes('s') ? 'calc(100% - 4px)' : 'calc(50% - 4px)' }} />)}
            </div>})}
        </div>} /></div>)}
    </main>
  </div>
}
