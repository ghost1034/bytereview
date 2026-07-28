'use client'

import * as React from 'react'
import {
  Calculator, CalendarDays, Check, CheckSquare, CircleDot, Copy,
  FileInput, ListChecks, Loader2, Paperclip, PenLine, Redo2, Search, Trash2, Type, Undo2, UserRound,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { validateFormula } from '@/lib/esign/fieldLogic'
import { openPdfFromUrl, participantColor, type PdfDocument } from '../pdf'
import { PdfPageCanvas } from '../PdfPageCanvas'
import { AlignmentGuides } from './AlignmentGuides'
import {
  anchorInstancesShareValue,
  resolveAnchorFieldType,
  supportsTextAppearance,
  type EditorFieldType,
} from './anchorPlacement'
import { getFloatingToolbarPosition } from './floatingToolbar'
import { snapRect, type SnapGuide } from './snapping'
import { configuredTextFontSize, textFontFamily, TEXT_FONT_OPTIONS } from './textAppearance'

export type { EditorFieldType } from './anchorPlacement'

export interface EditorDocument { id: string; name: string; url: string; pageCount: number }
export interface EditorParticipant { id: string; label: string }
export interface EditorFieldProperties {
  schema_version?: 2
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
  anchor?: {
    text?: string; anchor: string; rule_id: string; match_index?: number
    case_sensitive: boolean; whole_word: boolean; document_ids?: string[]; page_numbers?: number[]
    horizontal_alignment: 'left' | 'center' | 'right' | 'after'; offset_x: number; offset_y: number
    offset_unit: 'point' | 'mm' | 'inch'; match_mode: 'first' | 'all'; placement_mode?: 'automatic' | 'individual'; missing_policy: 'fail' | 'ignore'
  }
  allowed_types?: string[]
  data_label?: string
  tooltip?: string
  sender_prefill?: string
  multiline?: boolean
  read_only?: boolean
  shared_value?: boolean
  text_validation?: { max_length?: number; regex?: string; message?: string }
  number_validation?: { minimum?: number; maximum?: number; decimal_places?: number; allow_negative?: boolean }
  date_validation?: { minimum?: string; maximum?: string }
  selection_validation?: { minimum_selected?: number; maximum_selected?: number }
  selection_group?: { id: string; label: string; minimum_selected?: number; maximum_selected?: number; validation_message?: string }
  appearance?: { font?: string; font_size?: number; color?: string; alignment?: 'left' | 'center' | 'right'; bold?: boolean; italic?: boolean; underline?: boolean }
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
  focusFieldId?: string | null
  importingFillableFields?: boolean
  onImportFillableFields?: (documentId: string) => void
  onAnchorSearch?: (payload: {
    anchor: string; case_sensitive: boolean; whole_word: boolean; document_ids: string[]
    match_mode: 'first' | 'all'; horizontal_alignment: 'left' | 'center' | 'right' | 'after'
    offset_x: number; offset_y: number; offset_unit: 'point' | 'mm' | 'inch'; field_width: number; field_height: number
  }) => Promise<{ matches?: Array<{ document_id: string; page_number: number; x: number; y: number; width: number; height: number; anchor_x?: number | null; anchor_y?: number | null }> }>
}

interface AnchorPlacementSession {
  ruleId: string
  documentId: string
  participantId: string
  type: EditorFieldType
  size: { width: number; height: number }
  radioGroup: string | null
  anchor: string
  caseSensitive: boolean
  wholeWord: boolean
  firstOnly: boolean
  alignment: 'left' | 'center' | 'right' | 'after'
  offsetX: number
  offsetY: number
  offsetUnit: 'point' | 'mm' | 'inch'
  ignoreMissing: boolean
  matches: Array<{ document_id: string; page_number: number; x: number; y: number; width: number; height: number; anchor_x?: number | null; anchor_y?: number | null }>
}

const FIELD_TYPES: Array<{ type: EditorFieldType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { type: 'signature', label: 'Signature', icon: PenLine },
  { type: 'initials', label: 'Initials', icon: Type },
  { type: 'stamp', label: 'Stamp', icon: PenLine },
  { type: 'date_signed', label: 'Date signed', icon: CalendarDays },
  { type: 'date', label: 'Date', icon: CalendarDays },
  { type: 'number', label: 'Number', icon: Calculator },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'first_name', label: 'First name', icon: UserRound },
  { type: 'last_name', label: 'Last name', icon: UserRound },
  { type: 'full_name', label: 'Full name', icon: UserRound },
  { type: 'email', label: 'Email', icon: UserRound },
  { type: 'company', label: 'Company', icon: UserRound },
  { type: 'title', label: 'Title', icon: UserRound },
  { type: 'note', label: 'Note', icon: Type },
  { type: 'auto_fill', label: 'Auto-fill', icon: UserRound },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'radio', label: 'Radio group', icon: CircleDot },
  { type: 'dropdown', label: 'Dropdown', icon: ListChecks },
  { type: 'attachment', label: 'Attachment', icon: Paperclip },
  { type: 'formula', label: 'Formula', icon: Calculator },
]

const DEFAULT_SIZES: Record<EditorFieldType, { width: number; height: number }> = {
  signature: { width: 0.28, height: 0.045 }, initials: { width: 0.08, height: 0.035 },
  date_signed: { width: 0.16, height: 0.03 }, text: { width: 0.24, height: 0.03 },
  checkbox: { width: 0.03, height: 0.022 }, radio: { width: 0.03, height: 0.022 },
  dropdown: { width: 0.24, height: 0.035 }, attachment: { width: 0.28, height: 0.04 },
  formula: { width: 0.2, height: 0.03 }, auto_fill: { width: 0.24, height: 0.03 },
  stamp: { width: 0.16, height: 0.08 }, date: { width: 0.16, height: 0.03 },
  number: { width: 0.16, height: 0.03 }, first_name: { width: 0.18, height: 0.03 },
  last_name: { width: 0.18, height: 0.03 }, full_name: { width: 0.24, height: 0.03 },
  email: { width: 0.24, height: 0.03 }, company: { width: 0.24, height: 0.03 },
  title: { width: 0.2, height: 0.03 }, note: { width: 0.28, height: 0.04 },
}

const SHORT: Record<EditorFieldType, string> = {
  signature: 'Sign', initials: 'Initials', date_signed: 'Date', text: 'Text', checkbox: '☐',
  radio: '○', dropdown: 'Select ▾', attachment: 'Attach', formula: 'ƒx', auto_fill: 'Auto',
  stamp: 'Stamp', date: 'Date', number: '123', first_name: 'First name', last_name: 'Last name',
  full_name: 'Full name', email: 'Email', company: 'Company', title: 'Title', note: 'Note',
}
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = typeof HANDLES[number]
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const newId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `f_${Math.random().toString(36).slice(2)}`

const REQUIRED_FIELD_TYPES = new Set<EditorFieldType>([
  'signature', 'initials', 'stamp', 'date', 'number', 'text', 'company', 'title',
  'checkbox', 'radio', 'dropdown', 'attachment',
])

function FieldFloatingToolbar({ field, participants, participantIndexById, pageSize, update, updateRequired, remove }: {
  field: EditorField
  participants: EditorParticipant[]
  participantIndexById: Map<string, number>
  pageSize: { width: number; height: number }
  update: (patch: Partial<EditorField>) => void
  updateRequired: (required: boolean) => void
  remove: () => void
}) {
  const position = getFloatingToolbarPosition(field, pageSize.width, pageSize.height)
  const canBeRequired = REQUIRED_FIELD_TYPES.has(field.fieldType)

  return <div
    role="toolbar"
    aria-label={`${field.label || SHORT[field.fieldType]} field actions`}
    data-esign-field-toolbar={field.id}
    className={cn(
      'absolute z-30 flex h-10 items-center gap-1 rounded-lg border border-border bg-surface px-1.5 text-foreground shadow-lg',
      position.placement === 'above' && '-translate-y-full',
    )}
    style={{
      left: position.left,
      top: position.top,
      width: position.width,
    }}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
  >
    <span
      aria-hidden="true"
      className={cn(
        'absolute size-2 rotate-45 border-border bg-surface',
        position.placement === 'above' ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t',
      )}
      style={{ left: position.arrowLeft - 4 }}
    />
    <span className="shrink-0 rounded bg-surface-muted px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
      {SHORT[field.fieldType]}
    </span>
    <Select value={field.participantId} onValueChange={(participantId) => update({ participantId })}>
      <SelectTrigger className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus:ring-1 focus:ring-ring focus:ring-offset-0" aria-label="Assign field to recipient">
        <span className="mr-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: participantColor(participantIndexById.get(field.participantId) ?? 0).border }} />
        <SelectValue>{participants.find((participant) => participant.id === field.participantId)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {participants.map((participant, index) => <SelectItem key={participant.id} value={participant.id}>
          <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: participantColor(index).border }} />{participant.label}</span>
        </SelectItem>)}
      </SelectContent>
    </Select>
    {canBeRequired && <label className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-1.5 text-xs hover:bg-surface-muted" title="Mark field as required or optional">
      <input type="checkbox" className="size-3.5 accent-primary" checked={field.required} onChange={(event) => updateRequired(event.target.checked)} aria-label="Required field" />
      <span className="hidden sm:inline">Required</span>
    </label>}
    <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
    <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded text-foreground-muted hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={remove} title="Delete field" aria-label="Delete field">
      <Trash2 className="size-3.5" />
    </button>
  </div>
}

function defaultProperties(type: EditorFieldType, radioGroup: string | null): EditorFieldProperties {
  if (type === 'radio') return { schema_version: 2, group: { id: radioGroup ?? newId(), label: 'Choose one' }, option_value: `option_${newId()}`, sender_prefill: 'false' }
  if (type === 'dropdown') return { options: [{ value: 'option_1', label: 'Option 1' }] }
  if (type === 'auto_fill') return { auto_source: 'recipient_name' }
  if (type === 'formula') return { formula: { expression: '0', decimal_places: 2 } }
  if (type === 'attachment') return { allowed_types: ['application/pdf', 'image/png', 'image/jpeg'] }
  return { schema_version: 2 }
}

function PropertiesPanel({ field, fields, update, updateRadioGroup, remove }: {
  field: EditorField
  fields: EditorField[]
  update: (patch: Partial<EditorField>) => void
  updateRadioGroup: (transform: (member: EditorField) => EditorField) => void
  remove: () => void
}) {
  const properties = field.properties ?? {}
  const setProperties = (patch: Partial<EditorFieldProperties>) => update({ properties: { ...properties, ...patch } })
  const conditional = properties.conditional
  const conditionalCandidates = fields.filter((item) => item.id !== field.id && item.participantId === field.participantId && !['signature', 'initials', 'stamp', 'attachment', 'formula', 'note'].includes(item.fieldType))
  const conditionalParent = conditionalCandidates.find((item) => item.id === conditional?.parent_field_id)
  const canStyleText = supportsTextAppearance(field.fieldType)
  const [formulaError, setFormulaError] = React.useState('')
  return <div className="space-y-2 rounded-md border border-border bg-surface p-3 text-sm">
    <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Field properties</p>
    <input className="w-full rounded border border-border bg-background px-2 py-1" value={field.label ?? ''}
      onChange={(event) => update({ label: event.target.value })} placeholder="Label" />
    <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.data_label ?? ''}
      onChange={(event) => setProperties({ data_label: event.target.value })} placeholder="Data label" />
    <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.tooltip ?? ''}
      onChange={(event) => setProperties({ tooltip: event.target.value })} placeholder="Tooltip" />
    {!['date_signed', 'formula', 'note', 'first_name', 'last_name', 'full_name', 'email', 'auto_fill'].includes(field.fieldType) && <label className="flex gap-2">
      <input type="checkbox" checked={field.required} onChange={(event) => field.fieldType === 'radio'
        ? updateRadioGroup((member) => ({ ...member, required: event.target.checked }))
        : update({ required: event.target.checked })} /> Required
    </label>}
    {['text', 'number', 'date', 'company', 'title', 'checkbox', 'dropdown', 'auto_fill'].includes(field.fieldType) && <label className="flex gap-2">
      <input type="checkbox" checked={properties.shared_value ?? false} onChange={(event) => setProperties({ shared_value: event.target.checked })} /> Share values with this data label
    </label>}
    {['text', 'number', 'date', 'company', 'title', 'checkbox', 'radio', 'dropdown'].includes(field.fieldType) && <label className="flex gap-2">
      <input type="checkbox" checked={properties.read_only ?? false} onChange={(event) => setProperties({ read_only: event.target.checked })} /> Read only
    </label>}
    {(properties.read_only || field.fieldType === 'note') && field.fieldType === 'dropdown' && <select className="w-full rounded border border-border bg-background px-2 py-1" value={properties.sender_prefill ?? ''} onChange={(event) => setProperties({ sender_prefill: event.target.value || undefined })}><option value="">No default</option>{(properties.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
    {(properties.read_only || field.fieldType === 'note') && ['checkbox', 'radio'].includes(field.fieldType) && <label className="flex gap-2"><input type="checkbox" checked={properties.sender_prefill === 'true'} onChange={(event) => setProperties({ sender_prefill: event.target.checked ? 'true' : 'false' })} /> Selected by default</label>}
    {(properties.read_only || field.fieldType === 'note') && !['checkbox', 'radio', 'dropdown'].includes(field.fieldType) && <input type={field.fieldType === 'date' ? 'date' : 'text'} className="w-full rounded border border-border bg-background px-2 py-1" value={properties.sender_prefill ?? ''}
      onChange={(event) => setProperties({ sender_prefill: event.target.value })} placeholder="Sender prefill" />}
    {field.fieldType === 'text' && <label className="flex gap-2"><input type="checkbox" checked={properties.multiline ?? false} onChange={(event) => setProperties({ multiline: event.target.checked })} /> Multiline</label>}
    {['text', 'number', 'date', 'company', 'title'].includes(field.fieldType) && <details>
      <summary className="cursor-pointer text-xs font-medium">Validation</summary>
      <div className="mt-2 space-y-2">
        {['text', 'company', 'title'].includes(field.fieldType) && <><div className="grid grid-cols-2 gap-2"><input type="number" min={1} className="rounded border border-border bg-background px-2 py-1" value={properties.text_validation?.max_length ?? ''}
          onChange={(event) => setProperties({ text_validation: { ...properties.text_validation, max_length: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Max length" />
        <input className="rounded border border-border bg-background px-2 py-1" value={properties.text_validation?.regex ?? ''}
          onChange={(event) => setProperties({ text_validation: { ...properties.text_validation, regex: event.target.value || undefined } })} placeholder="Regex" /></div><input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.text_validation?.message ?? ''} onChange={(event) => setProperties({ text_validation: { ...properties.text_validation, message: event.target.value || undefined } })} placeholder="Validation message" /></>}
        {field.fieldType === 'number' && <><div className="grid grid-cols-2 gap-2"><input type="number" className="rounded border border-border bg-background px-2 py-1" value={properties.number_validation?.minimum ?? ''} onChange={(event) => setProperties({ number_validation: { ...properties.number_validation, minimum: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Minimum" /><input type="number" className="rounded border border-border bg-background px-2 py-1" value={properties.number_validation?.maximum ?? ''} onChange={(event) => setProperties({ number_validation: { ...properties.number_validation, maximum: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Maximum" /></div><div className="grid grid-cols-2 gap-2"><input type="number" min={0} max={10} className="rounded border border-border bg-background px-2 py-1" value={properties.number_validation?.decimal_places ?? ''} onChange={(event) => setProperties({ number_validation: { ...properties.number_validation, decimal_places: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Decimal places" /><label className="flex items-center gap-2"><input type="checkbox" checked={properties.number_validation?.allow_negative ?? true} onChange={(event) => setProperties({ number_validation: { ...properties.number_validation, allow_negative: event.target.checked } })} /> Allow negative</label></div></>}
        {field.fieldType === 'date' && <div className="grid grid-cols-2 gap-2"><input type="date" className="rounded border border-border bg-background px-2 py-1" value={properties.date_validation?.minimum ?? ''} onChange={(event) => setProperties({ date_validation: { ...properties.date_validation, minimum: event.target.value || undefined } })} /><input type="date" className="rounded border border-border bg-background px-2 py-1" value={properties.date_validation?.maximum ?? ''} onChange={(event) => setProperties({ date_validation: { ...properties.date_validation, maximum: event.target.value || undefined } })} /></div>}
      </div>
    </details>}
    {canStyleText && <fieldset className="space-y-2 rounded-md border border-border p-2">
      <legend className="px-1 text-xs font-medium">Text appearance</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-foreground-muted">Font</span><select aria-label="Font" className="w-full rounded border border-border bg-background px-2 py-1" value={properties.appearance?.font ?? 'Helvetica'} onChange={(event) => setProperties({ appearance: { ...properties.appearance, font: event.target.value } })}>{TEXT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-foreground-muted">Size (pt)</span><input aria-label="Font size" type="number" min={4} max={144} className="w-full rounded border border-border bg-background px-2 py-1" value={properties.appearance?.font_size ?? ''} onChange={(event) => setProperties({ appearance: { ...properties.appearance, font_size: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Auto" /></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-foreground-muted">Color</span><input aria-label="Text color" type="color" className="h-8 w-full rounded border border-border bg-background" value={properties.appearance?.color ?? '#000000'} onChange={(event) => setProperties({ appearance: { ...properties.appearance, color: event.target.value } })} /></label>
      <label className="block"><span className="mb-1 block text-xs text-foreground-muted">Alignment</span><select aria-label="Text alignment" className="w-full rounded border border-border bg-background px-2 py-1" value={properties.appearance?.alignment ?? 'left'} onChange={(event) => setProperties({ appearance: { ...properties.appearance, alignment: event.target.value as 'left' | 'center' | 'right' } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <div className="flex gap-3"><label><input type="checkbox" checked={properties.appearance?.bold ?? false} onChange={(event) => setProperties({ appearance: { ...properties.appearance, bold: event.target.checked } })} /> Bold</label><label><input type="checkbox" checked={properties.appearance?.italic ?? false} onChange={(event) => setProperties({ appearance: { ...properties.appearance, italic: event.target.checked } })} /> Italic</label><label><input type="checkbox" checked={properties.appearance?.underline ?? false} onChange={(event) => setProperties({ appearance: { ...properties.appearance, underline: event.target.checked } })} /> Underline</label></div>
    </fieldset>}
    {field.fieldType === 'checkbox' && <details><summary className="cursor-pointer text-xs font-medium">Selection group (optional)</summary><div className="mt-2 space-y-2"><div className="grid grid-cols-2 gap-2"><input className="rounded border border-border bg-background px-2 py-1" value={properties.selection_group?.id ?? ''} onChange={(event) => setProperties({ selection_group: event.target.value ? { id: event.target.value, label: properties.selection_group?.label || 'Choose options', minimum_selected: properties.selection_group?.minimum_selected ?? 0, maximum_selected: properties.selection_group?.maximum_selected } : undefined })} placeholder="Stable group ID" /><input className="rounded border border-border bg-background px-2 py-1" value={properties.selection_group?.label ?? ''} onChange={(event) => properties.selection_group && setProperties({ selection_group: { ...properties.selection_group, label: event.target.value } })} placeholder="Group label" /></div>{properties.selection_group && <><div className="grid grid-cols-2 gap-2"><input type="number" min={0} className="rounded border border-border bg-background px-2 py-1" value={properties.selection_group.minimum_selected ?? 0} onChange={(event) => setProperties({ selection_group: { ...properties.selection_group!, minimum_selected: Number(event.target.value) || 0 } })} placeholder="Minimum" /><input type="number" min={1} className="rounded border border-border bg-background px-2 py-1" value={properties.selection_group.maximum_selected ?? ''} onChange={(event) => setProperties({ selection_group: { ...properties.selection_group!, maximum_selected: event.target.value ? Number(event.target.value) : undefined } })} placeholder="Maximum" /></div><input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.selection_group.validation_message ?? ''} onChange={(event) => setProperties({ selection_group: { ...properties.selection_group!, validation_message: event.target.value || undefined } })} placeholder="Validation message" /></>}</div></details>}
    {field.fieldType === 'checkbox' && !properties.read_only && <label className="flex gap-2"><input type="checkbox" checked={properties.sender_prefill === 'true'} onChange={(event) => setProperties({ sender_prefill: event.target.checked ? 'true' : 'false' })} /> Checked by default</label>}
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
        onChange={(event) => setProperties({ options: event.target.value.split('\n').filter(Boolean).map((label, index) => ({ value: properties.options?.[index]?.value ?? `option_${newId()}`, label })) })} />
    </label>}
    {field.fieldType === 'dropdown' && <label className="block">Default option<select className="mt-1 w-full rounded border border-border bg-background px-2 py-1" value={properties.sender_prefill ?? ''} onChange={(event) => setProperties({ sender_prefill: event.target.value || undefined })}><option value="">No default</option>{(properties.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
    {field.fieldType === 'radio' && <>
      <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.group?.label ?? ''}
        onChange={(event) => updateRadioGroup((member) => ({ ...member, properties: { ...member.properties, group: { id: member.properties?.group?.id ?? properties.group?.id ?? newId(), label: event.target.value } } }))} placeholder="Group label" />
      <input className="w-full rounded border border-border bg-background px-2 py-1" value={properties.option_value ?? ''}
        onChange={(event) => setProperties({ option_value: event.target.value })} placeholder="Option value" />
      <label className="flex gap-2"><input type="checkbox" checked={properties.sender_prefill === 'true'} onChange={(event) => updateRadioGroup((member) => ({ ...member, properties: { ...member.properties, sender_prefill: event.target.checked && member.id === field.id ? 'true' : 'false' } }))} /> Default option</label>
    </>}
    {field.fieldType === 'attachment' && <fieldset className="space-y-1"><legend className="text-xs font-medium">Allowed file types</legend>{[
      ['application/pdf', 'PDF'], ['image/png', 'PNG'], ['image/jpeg', 'JPG'],
    ].map(([mime, label]) => <label key={mime} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={(properties.allowed_types ?? []).includes(mime)} onChange={(event) => setProperties({ allowed_types: event.target.checked ? [...new Set([...(properties.allowed_types ?? []), mime])] : (properties.allowed_types ?? []).filter((item) => item !== mime) })} /> {label}</label>)}</fieldset>}
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
        {fields.filter((item) => item.id !== field.id && item.participantId === field.participantId && !['signature', 'initials', 'stamp', 'attachment'].includes(item.fieldType)).map((item) => <option key={item.id} value={item.properties?.data_label ?? item.id}>{item.label || SHORT[item.fieldType]}</option>)}
      </select>
      {formulaError && <span className="text-xs text-destructive">{formulaError}</span>}
    </label>}
    <label className="block">Conditional behavior
      <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
        disabled={conditionalCandidates.length === 0}
        value={conditional ? conditional.action : 'none'} onChange={(event) => {
          if (event.target.value === 'none') setProperties({ conditional: undefined })
          else setProperties({ conditional: { parent_field_id: conditionalCandidates[0].id, operator: 'not_empty', values: [], action: event.target.value as 'show' | 'require' } })
        }}>
        <option value="none">Always visible</option><option value="show">Show when…</option><option value="require">Require when…</option>
      </select>
    </label>
    {conditional && <>
      <select className="w-full rounded border border-border bg-background px-2 py-1" value={conditional.parent_field_id}
        onChange={(event) => setProperties({ conditional: { ...conditional, parent_field_id: event.target.value } })}>
        {conditionalCandidates.map((item) => <option key={item.id} value={item.id}>{item.label || SHORT[item.fieldType]}</option>)}
      </select>
      <select className="w-full rounded border border-border bg-background px-2 py-1" value={conditional.operator}
        onChange={(event) => setProperties({ conditional: { ...conditional, operator: event.target.value as NonNullable<EditorFieldProperties['conditional']>['operator'] } })}>
        <option value="not_empty">Is not empty</option><option value="equals">Equals</option><option value="not_equals">Does not equal</option>
        <option value="any_of">Any of</option>{['checkbox', 'radio'].includes(conditionalParent?.fieldType ?? '') && <><option value="checked">Checked</option><option value="unchecked">Unchecked</option></>}
      </select>
      {!['not_empty', 'checked', 'unchecked'].includes(conditional.operator) && <input className="w-full rounded border border-border bg-background px-2 py-1"
        value={(conditional.values ?? []).join(', ')} onChange={(event) => setProperties({ conditional: { ...conditional, values: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) } })} placeholder="Value(s), comma separated" />}
    </>}
    <Button type="button" variant="outline" size="sm" className="w-full text-destructive" onClick={remove}><Trash2 className="mr-1.5 size-3.5" /> Remove</Button>
  </div>
}

export function PdfFieldEditor({ documents, participants, fields, onChange, className, focusFieldId, importingFillableFields = false, onImportFillableFields, onAnchorSearch }: PdfFieldEditorProps) {
  const [activeDocumentId, setActiveDocumentId] = React.useState(documents[0]?.id)
  const [activeParticipantId, setActiveParticipantId] = React.useState(participants[0]?.id)
  const [armedType, setArmedType] = React.useState<EditorFieldType | null>(null)
  const [radioGroup, setRadioGroup] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [guides, setGuides] = React.useState<SnapGuide[]>([])
  const [marquee, setMarquee] = React.useState<{ page: number; x: number; y: number; width: number; height: number } | null>(null)
  const [anchorOpen, setAnchorOpen] = React.useState(false)
  const [anchorText, setAnchorText] = React.useState('')
  const [anchorResult, setAnchorResult] = React.useState('')
  const [anchorCaseSensitive, setAnchorCaseSensitive] = React.useState(false)
  const [anchorWholeWord, setAnchorWholeWord] = React.useState(false)
  const [anchorFirstOnly, setAnchorFirstOnly] = React.useState(false)
  const [anchorAlignment, setAnchorAlignment] = React.useState<'left' | 'center' | 'right' | 'after'>('after')
  const [anchorOffsetX, setAnchorOffsetX] = React.useState(0)
  const [anchorOffsetY, setAnchorOffsetY] = React.useState(0)
  const [anchorOffsetUnit, setAnchorOffsetUnit] = React.useState<'point' | 'mm' | 'inch'>('point')
  const [anchorIgnoreMissing, setAnchorIgnoreMissing] = React.useState(false)
  const [anchorSearching, setAnchorSearching] = React.useState(false)
  const [anchorSession, setAnchorSession] = React.useState<AnchorPlacementSession | null>(null)
  const past = React.useRef<EditorField[][]>([])
  const future = React.useRef<EditorField[][]>([])
  const clipboard = React.useRef<EditorField[]>([])
  const containerRef = React.useRef<HTMLDivElement>(null)
  const activeDocument = documents.find((doc) => doc.id === activeDocumentId) ?? documents[0]
  const activeDocumentUrl = activeDocument?.url
  const resolvedActiveDocumentId = activeDocument?.id
  const participantIndexById = React.useMemo(() => new Map(participants.map((participant, index) => [participant.id, index])), [participants])
  const placedAnchorMatchIndexes = React.useMemo(() => new Set(fields.flatMap((field) => {
    const anchor = field.properties?.anchor
    return anchorSession && anchor?.rule_id === anchorSession.ruleId && anchor.match_index !== undefined ? [anchor.match_index] : []
  })), [anchorSession, fields])

  // Parent pages derive `documents` inline. Watch stable values so field edits
  // do not turn new object references into unnecessary PDF reloads.
  React.useEffect(() => {
    if (!activeDocumentUrl) {
      setPdf(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setPdf(null); setLoadError(null)
    openPdfFromUrl(activeDocumentUrl).then((doc) => { if (!cancelled) setPdf(doc) })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load PDF') })
    return () => { cancelled = true }
  }, [activeDocumentUrl, resolvedActiveDocumentId])

  React.useEffect(() => {
    if (!focusFieldId) return
    const field = fields.find((item) => item.id === focusFieldId)
    if (!field) return
    setActiveDocumentId(field.documentId)
    setActiveParticipantId(field.participantId)
    setSelectedIds(new Set([field.id]))
    window.setTimeout(() => {
      document.getElementById(`esign-editor-field-${field.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }, [fields, focusFieldId])

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

  const updateSelectedField = React.useCallback((patch: Partial<EditorField>) => {
    if (!selectedField) return
    commit(fields.map((field) => field.id === selectedField.id ? { ...field, ...patch } : field))
  }, [commit, fields, selectedField])

  const updateSelectedRequired = React.useCallback((required: boolean) => {
    if (!selectedField) return
    const group = selectedField.fieldType === 'radio' ? selectedField.properties?.group?.id : undefined
    commit(fields.map((field) => field.id === selectedField.id || (group && field.fieldType === 'radio' && field.properties?.group?.id === group)
      ? { ...field, required }
      : field))
  }, [commit, fields, selectedField])

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
      width: size.width, height: size.height, required: !['formula', 'note'].includes(armedType),
      properties: { ...defaultProperties(armedType, radioGroup), data_label: `${armedType}_${newId().slice(0, 8)}`, read_only: armedType === 'note' } }
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
      if (event.shiftKey && ['signature', 'initials', 'stamp'].includes(original.fieldType)) { const ratio = original.width / original.height; if (Math.abs(dx) > Math.abs(dy)) h = w / ratio; else w = h * ratio }
      w = clamp(w, 0.02, 1 - x); h = clamp(h, 0.012, 1 - y); x = clamp(x, 0, original.posX + original.width - 0.02); y = clamp(y, 0, original.posY + original.height - 0.012)
      onChange(state.before.map((field) => field.id === original.id ? { ...field, posX: x, posY: y, width: w, height: h } : field))
    }
  }
  const endInteraction = () => { const state = drag.current; if (!state) return; past.current.push(state.before); future.current = []; drag.current = null; setGuides([]) }

  const focusAnchorMatch = (ruleId: string, matchIndex: number) => {
    window.setTimeout(() => document.getElementById(`esign-anchor-match-${ruleId}-${matchIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }

  const findAnchorMatches = async () => {
    if (!activeDocument || !activeParticipantId || !onAnchorSearch) { setAnchorResult('Server anchor search is unavailable.'); return }
    const anchor = anchorText.trim(); if (!anchor) return
    const type = resolveAnchorFieldType(armedType); const size = DEFAULT_SIZES[type]
    const anchorRadioGroup = type === 'radio' ? radioGroup ?? newId() : null
    const ruleId = newId(); setAnchorSearching(true)
    try {
      const result = await onAnchorSearch({ anchor, case_sensitive: anchorCaseSensitive, whole_word: anchorWholeWord,
        document_ids: [activeDocument.id], match_mode: anchorFirstOnly ? 'first' : 'all', horizontal_alignment: anchorAlignment, offset_x: anchorOffsetX, offset_y: anchorOffsetY, offset_unit: anchorOffsetUnit,
        field_width: size.width, field_height: size.height })
      const matches = result.matches ?? []
      if (matches.length) {
        setAnchorSession({ ruleId, documentId: activeDocument.id, participantId: activeParticipantId, type, size,
          radioGroup: anchorRadioGroup, anchor, caseSensitive: anchorCaseSensitive, wholeWord: anchorWholeWord,
          firstOnly: anchorFirstOnly, alignment: anchorAlignment, offsetX: anchorOffsetX, offsetY: anchorOffsetY,
          offsetUnit: anchorOffsetUnit, ignoreMissing: anchorIgnoreMissing, matches })
        setAnchorResult('')
        setAnchorOpen(false); setArmedType(null); setRadioGroup(null)
        focusAnchorMatch(ruleId, 0)
      } else {
        setAnchorSession(null)
        setAnchorResult(`No matches found for “${anchor}”.`)
      }
    } catch (error) { setAnchorResult(error instanceof Error ? error.message : 'Anchor search failed.') }
    finally { setAnchorSearching(false) }
  }

  const placeAnchorMatch = (matchIndex: number) => {
    if (!anchorSession || placedAnchorMatchIndexes.has(matchIndex)) return
    const match = anchorSession.matches[matchIndex]
    if (!match) return
    const id = newId()
    const field: EditorField = { id, documentId: match.document_id, participantId: anchorSession.participantId,
      fieldType: anchorSession.type, pageNumber: match.page_number,
      posX: clamp(match.x, 0, 1 - anchorSession.size.width), posY: clamp(match.y, 0, 1 - anchorSession.size.height),
      width: anchorSession.size.width, height: anchorSession.size.height,
      required: !['formula', 'note'].includes(anchorSession.type),
      properties: { ...defaultProperties(anchorSession.type, anchorSession.radioGroup),
        data_label: `${anchorSession.type}_${anchorSession.ruleId.slice(0, 8)}${anchorInstancesShareValue(anchorSession.type) ? '' : `_${matchIndex + 1}`}`,
        shared_value: anchorInstancesShareValue(anchorSession.type), read_only: anchorSession.type === 'note',
        anchor: { anchor: anchorSession.anchor, rule_id: anchorSession.ruleId, match_index: matchIndex,
          case_sensitive: anchorSession.caseSensitive, whole_word: anchorSession.wholeWord,
          document_ids: [anchorSession.documentId], horizontal_alignment: anchorSession.alignment,
          offset_x: anchorSession.offsetX, offset_y: anchorSession.offsetY, offset_unit: anchorSession.offsetUnit,
          match_mode: anchorSession.firstOnly ? 'first' : 'all', placement_mode: 'individual',
          missing_policy: anchorSession.ignoreMissing ? 'ignore' : 'fail' } } }
    commit([...fields, field]); setSelectedIds(new Set([id])); setAnchorResult('')
    const placedCount = placedAnchorMatchIndexes.size + 1
    if (placedCount === anchorSession.matches.length) setAnchorSession(null)
  }

  if (!documents.length || !participants.length) return <p className="text-sm text-foreground-muted">Add documents and recipients before placing fields.</p>

  return <div ref={containerRef} tabIndex={0} className={cn('flex flex-col gap-4 outline-none lg:flex-row', className)}>
    <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:w-64 lg:self-start lg:overflow-y-auto lg:pr-1">
      {documents.length > 1 && <Select value={activeDocument?.id} onValueChange={(documentId) => { setActiveDocumentId(documentId); if (anchorSession?.documentId !== documentId) { setAnchorSession(null); setAnchorResult('') } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{documents.map((doc) => <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>)}</SelectContent></Select>}
      <div className="space-y-1.5"><p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Assign to</p>{participants.map((participant, index) => {
        const color = participantColor(index); return <button key={participant.id} type="button" onClick={() => setActiveParticipantId(participant.id)}
          className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm', participant.id === activeParticipantId ? 'border-primary bg-primary-soft' : 'border-border bg-surface')}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color.border }} /> <span className="truncate">{participant.label}</span></button>})}</div>
      <div className="space-y-1.5"><p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Fields</p>
        <div className="grid grid-cols-2 gap-1.5">{FIELD_TYPES.map(({ type, label, icon: Icon }) => <button key={type} type="button" title={label}
          onClick={() => { const next = armedType === type ? null : type; setArmedType(next); setRadioGroup(next === 'radio' ? newId() : null) }}
          className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs', armedType === type ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface')}><Icon className="size-3.5" />{label}</button>)}</div>
        {onImportFillableFields && activeDocument && <Button type="button" variant="outline" size="sm" className="w-full" disabled={importingFillableFields} onClick={() => onImportFillableFields(activeDocument.id)}>{importingFillableFields ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <FileInput className="mr-1.5 size-3.5" />} Import fillable fields</Button>}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setAnchorResult(''); setAnchorOpen(true) }}><Search className="mr-1.5 size-3.5" /> Place by anchor</Button>
        {anchorSession && <div className="space-y-2 rounded-md border border-primary/30 bg-primary-soft p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground">Anchor matches</span><span className="rounded-full bg-surface px-2 py-0.5 font-medium text-primary">{placedAnchorMatchIndexes.size}/{anchorSession.matches.length} placed</span></div>
          <p className="text-foreground-muted">Select a dashed box to place {SHORT[anchorSession.type].toLowerCase()}.</p>
          {anchorResult && <p className="text-foreground-muted" role="status" aria-live="polite">{anchorResult}</p>}
          <div className="flex gap-1.5"><Button type="button" variant="outline" size="sm" className="h-7 flex-1 text-xs" disabled={placedAnchorMatchIndexes.size === anchorSession.matches.length} onClick={() => {
            const next = anchorSession.matches.findIndex((_, index) => !placedAnchorMatchIndexes.has(index))
            if (next >= 0) focusAnchorMatch(anchorSession.ruleId, next)
          }}>Next unplaced</Button><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setAnchorSession(null); setAnchorResult('') }}>Done</Button></div>
        </div>}
        <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={undo} title="Undo"><Undo2 className="size-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={redo} title="Redo"><Redo2 className="size-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={() => duplicate(fields.filter((field) => selectedIds.has(field.id)))} title="Duplicate"><Copy className="size-4" /></Button></div>
        <p className="text-xs text-foreground-subtle">{armedType ? armedType === 'radio' ? 'Click repeatedly to add options; Escape ends the group.' : 'Click a page to place.' : 'Shift/Cmd-click or drag a marquee to multi-select. Alt disables snapping.'}</p>
      </div>
      {selectedField && <PropertiesPanel field={selectedField} fields={fields} update={updateSelectedField} updateRadioGroup={(transform) => { const group = selectedField.properties?.group?.id; commit(fields.map((field) => field.fieldType === 'radio' && field.properties?.group?.id === group ? transform(field) : field)) }} remove={removeSelected} />}
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
          {anchorSession?.documentId === activeDocument.id && anchorSession.matches.map((match, matchIndex) => {
            if (match.page_number !== pageIndex) return null
            const placed = placedAnchorMatchIndexes.has(matchIndex)
            const anchorX = match.anchor_x ?? match.x
            const anchorY = match.anchor_y ?? match.y
            return <React.Fragment key={`${anchorSession.ruleId}-${matchIndex}`}>
              <span id={`esign-anchor-match-${anchorSession.ruleId}-${matchIndex}`} className={cn('pointer-events-none absolute z-10 rounded-sm ring-2', placed ? 'bg-success/20 ring-success' : 'bg-amber-300/40 ring-amber-500')}
                style={{ left: anchorX * size.width, top: anchorY * size.height, width: Math.max(match.width * size.width, 4), height: Math.max(match.height * size.height, 4) }}>
                <span className={cn('absolute -left-2 -top-3 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm', placed ? 'bg-success' : 'bg-amber-600')}>{placed ? <Check className="size-3" /> : matchIndex + 1}</span>
              </span>
              {!placed && <button type="button" className="absolute z-20 flex items-center justify-center rounded-sm border-2 border-dashed border-primary bg-primary/15 text-[10px] font-semibold text-primary shadow-sm transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{ left: match.x * size.width, top: match.y * size.height, width: anchorSession.size.width * size.width, height: anchorSession.size.height * size.height }}
                aria-label={`Place ${anchorSession.type.replace(/_/g, ' ')} field at anchor match ${matchIndex + 1}`}
                title={`Match ${matchIndex + 1}: place ${anchorSession.type.replace(/_/g, ' ')} field`}
                onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); placeAnchorMatch(matchIndex) }}>
                <span className="pointer-events-none truncate px-1">+ {SHORT[anchorSession.type]}</span>
              </button>}
            </React.Fragment>
          })}
          {fields.filter((field) => field.documentId === activeDocument.id && field.pageNumber === pageIndex).map((field) => { const color = participantColor(participantIndexById.get(field.participantId) ?? 0); const selected = selectedIds.has(field.id); const isConditionalParent = selectedField?.properties?.conditional?.parent_field_id === field.id; const canStyleText = supportsTextAppearance(field.fieldType); const appearance = field.properties?.appearance
            return <div key={field.id} id={`esign-editor-field-${field.id}`} onPointerDown={(event) => startInteraction(event, field, 'move', size)} onPointerMove={moveInteraction} onPointerUp={endInteraction}
              className={cn('absolute flex touch-none select-none items-center justify-center overflow-visible rounded-sm border text-[10px] font-medium', selected && 'ring-2 ring-offset-1', isConditionalParent && 'ring-2 ring-fuchsia-500 ring-offset-1')}
              style={{ left: field.posX * size.width, top: field.posY * size.height, width: field.width * size.width, height: field.height * size.height, borderColor: color.border, backgroundColor: color.bg, color: canStyleText && appearance?.color ? appearance.color : color.text, cursor: 'move', justifyContent: canStyleText ? ({ left: 'flex-start', center: 'center', right: 'flex-end' } as const)[appearance?.alignment ?? 'left'] : undefined, textAlign: canStyleText ? appearance?.alignment : undefined, fontFamily: canStyleText ? textFontFamily(appearance?.font) : undefined, fontSize: canStyleText ? configuredTextFontSize(appearance?.font_size, size.scale, field.height * size.height) : undefined, fontWeight: canStyleText && appearance?.bold ? 700 : undefined, fontStyle: canStyleText && appearance?.italic ? 'italic' : undefined, textDecoration: canStyleText && appearance?.underline ? 'underline' : undefined }}>
              <span className="pointer-events-none truncate px-1">{SHORT[field.fieldType]}</span>{field.properties?.conditional && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-fuchsia-500" />}
              {selected && HANDLES.map((handle) => <span key={handle} onPointerDown={(event) => startInteraction(event, field, 'resize', size, handle)} onPointerMove={moveInteraction} onPointerUp={endInteraction}
                className="absolute size-2 rounded-[1px] border border-white bg-primary" style={{ cursor: `${handle}-resize`, left: handle.includes('w') ? -4 : handle.includes('e') ? 'calc(100% - 4px)' : 'calc(50% - 4px)', top: handle.includes('n') ? -4 : handle.includes('s') ? 'calc(100% - 4px)' : 'calc(50% - 4px)' }} />)}
            </div>})}
          {selectedIds.size === 1 && selectedField?.documentId === activeDocument.id && selectedField.pageNumber === pageIndex && <FieldFloatingToolbar
            field={selectedField}
            participants={participants}
            participantIndexById={participantIndexById}
            pageSize={size}
            update={updateSelectedField}
            updateRequired={updateSelectedRequired}
            remove={removeSelected}
          />}
        </div>} /></div>)}
    </main>
    <Dialog open={anchorOpen} onOpenChange={setAnchorOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Place fields by anchor</DialogTitle><DialogDescription>Find matching text in the active document, review every highlighted location, then place fields one at a time.</DialogDescription></DialogHeader>
        <div className="space-y-2"><label htmlFor="esign-anchor-text" className="text-sm font-medium">Anchor text</label><Input id="esign-anchor-text" value={anchorText} onChange={(event) => setAnchorText(event.target.value)} placeholder="e.g. Client signature" autoFocus />
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={anchorCaseSensitive} onChange={(event) => setAnchorCaseSensitive(event.target.checked)} /> Case sensitive</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={anchorWholeWord} onChange={(event) => setAnchorWholeWord(event.target.checked)} /> Whole word</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={anchorFirstOnly} onChange={(event) => setAnchorFirstOnly(event.target.checked)} /> First match only</label>
          <div className="grid grid-cols-2 gap-2"><select className="rounded border border-border bg-background px-2 py-1 text-sm" value={anchorAlignment} onChange={(event) => setAnchorAlignment(event.target.value as typeof anchorAlignment)}><option value="after">Place after anchor</option><option value="left">Align left edges</option><option value="center">Align centers</option><option value="right">Align right edges</option></select><select className="rounded border border-border bg-background px-2 py-1 text-sm" value={anchorOffsetUnit} onChange={(event) => setAnchorOffsetUnit(event.target.value as typeof anchorOffsetUnit)}><option value="point">Points</option><option value="mm">Millimeters</option><option value="inch">Inches</option></select></div>
          <div className="grid grid-cols-2 gap-2"><Input type="number" value={anchorOffsetX} onChange={(event) => setAnchorOffsetX(Number(event.target.value))} placeholder="Horizontal offset" /><Input type="number" value={anchorOffsetY} onChange={(event) => setAnchorOffsetY(Number(event.target.value))} placeholder="Vertical offset" /></div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={anchorIgnoreMissing} onChange={(event) => setAnchorIgnoreMissing(event.target.checked)} /> Allow missing anchor</label>
          {anchorResult && <p className="text-sm text-foreground-muted" role="status" aria-live="polite">{anchorResult}</p>}</div>
        <DialogFooter><Button variant="outline" onClick={() => setAnchorOpen(false)}>Close</Button><Button onClick={findAnchorMatches} disabled={!anchorText.trim() || anchorSearching}>{anchorSearching && <Loader2 className="mr-1.5 size-4 animate-spin" />}Find matches</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
