'use client'

import * as React from 'react'
import { CalendarDays, CheckSquare, Loader2, PenLine, Trash2, Type } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { openPdfFromUrl, participantColor, type PdfDocument } from '../pdf'
import { PdfPageCanvas } from '../PdfPageCanvas'

export type EditorFieldType = 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox'

export interface EditorDocument {
  id: string
  name: string
  url: string
  pageCount: number
}

export interface EditorParticipant {
  id: string
  label: string
}

export interface EditorField {
  id: string
  documentId: string
  participantId: string
  fieldType: EditorFieldType
  pageNumber: number // 0-based
  posX: number
  posY: number
  width: number
  height: number
  required: boolean
  label?: string
}

interface PdfFieldEditorProps {
  documents: EditorDocument[]
  participants: EditorParticipant[]
  fields: EditorField[]
  onChange: (fields: EditorField[]) => void
  className?: string
}

const FIELD_TYPES: { type: EditorFieldType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'signature', label: 'Signature', icon: PenLine },
  { type: 'initials', label: 'Initials', icon: Type },
  { type: 'date_signed', label: 'Date signed', icon: CalendarDays },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
]

// Default sizes as fractions of a US-letter page
const DEFAULT_SIZES: Record<EditorFieldType, { width: number; height: number }> = {
  signature: { width: 0.28, height: 0.045 },
  initials: { width: 0.08, height: 0.035 },
  date_signed: { width: 0.16, height: 0.03 },
  text: { width: 0.24, height: 0.03 },
  checkbox: { width: 0.03, height: 0.022 },
}

const FIELD_TYPE_SHORT: Record<EditorFieldType, string> = {
  signature: 'Sign',
  initials: 'Initials',
  date_signed: 'Date',
  text: 'Text',
  checkbox: '☐',
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f_${Math.random().toString(36).slice(2)}`
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/**
 * Field-placement editor: pdf.js page canvases with an absolutely-positioned
 * overlay. Click a palette tool, then click the page to place; drag to move,
 * bottom-right handle to resize. Coordinates are stored as fractions of the
 * page size (top-left origin, 0-based page index) — the backend maps them to
 * PDF points at flatten time.
 */
export function PdfFieldEditor({ documents, participants, fields, onChange, className }: PdfFieldEditorProps) {
  const [activeDocumentId, setActiveDocumentId] = React.useState(documents[0]?.id)
  const [activeParticipantId, setActiveParticipantId] = React.useState(participants[0]?.id)
  const [armedType, setArmedType] = React.useState<EditorFieldType | null>(null)
  const [selectedFieldId, setSelectedFieldId] = React.useState<string | null>(null)
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? documents[0]
  const participantIndexById = React.useMemo(
    () => new Map(participants.map((p, i) => [p.id, i])),
    [participants],
  )

  React.useEffect(() => {
    if (!activeDocument) return
    let cancelled = false
    setPdf(null)
    setLoadError(null)
    openPdfFromUrl(activeDocument.url)
      .then((doc) => {
        if (!cancelled) setPdf(doc)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load PDF')
      })
    return () => {
      cancelled = true
    }
  }, [activeDocument?.id, activeDocument?.url])

  const updateField = (id: string, patch: Partial<EditorField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id))
    if (selectedFieldId === id) setSelectedFieldId(null)
  }

  const placeField = (pageIndex: number, fracX: number, fracY: number) => {
    if (!armedType || !activeDocument || !activeParticipantId) return
    const size = DEFAULT_SIZES[armedType]
    const field: EditorField = {
      id: newId(),
      documentId: activeDocument.id,
      participantId: activeParticipantId,
      fieldType: armedType,
      pageNumber: pageIndex,
      posX: clamp(fracX - size.width / 2, 0, 1 - size.width),
      posY: clamp(fracY - size.height / 2, 0, 1 - size.height),
      width: size.width,
      height: size.height,
      required: true,
    }
    onChange([...fields, field])
    setSelectedFieldId(field.id)
    setArmedType(null)
  }

  // -- drag / resize (hand-rolled pointer events with pointer capture) -------
  const dragState = React.useRef<{
    fieldId: string
    mode: 'move' | 'resize'
    startX: number
    startY: number
    orig: EditorField
    pageWidth: number
    pageHeight: number
  } | null>(null)

  const onFieldPointerDown = (
    e: React.PointerEvent,
    field: EditorField,
    mode: 'move' | 'resize',
    pageSize: { width: number; height: number },
  ) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedFieldId(field.id)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      fieldId: field.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...field },
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
    }
  }

  const onFieldPointerMove = (e: React.PointerEvent) => {
    const state = dragState.current
    if (!state) return
    const dx = (e.clientX - state.startX) / state.pageWidth
    const dy = (e.clientY - state.startY) / state.pageHeight
    const { orig } = state
    if (state.mode === 'move') {
      updateField(state.fieldId, {
        posX: clamp(orig.posX + dx, 0, 1 - orig.width),
        posY: clamp(orig.posY + dy, 0, 1 - orig.height),
      })
    } else {
      updateField(state.fieldId, {
        width: clamp(orig.width + dx, 0.02, 1 - orig.posX),
        height: clamp(orig.height + dy, 0.012, 1 - orig.posY),
      })
    }
  }

  const onFieldPointerUp = () => {
    dragState.current = null
  }

  if (!documents.length || !participants.length) {
    return (
      <p className="text-sm text-foreground-muted">
        Add documents and recipients before placing fields.
      </p>
    )
  }

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null

  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row', className)}>
      {/* Left rail: participants + palette */}
      <div className="w-full shrink-0 space-y-4 lg:w-60">
        {documents.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Document</p>
            <Select value={activeDocument?.id} onValueChange={setActiveDocumentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Assign to</p>
          <div className="flex flex-col gap-1.5">
            {participants.map((participant, index) => {
              const color = participantColor(index)
              const active = participant.id === activeParticipantId
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => setActiveParticipantId(participant.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                    active ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface-muted',
                  )}
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.border }}
                    aria-hidden
                  />
                  <span className="truncate">{participant.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Fields</p>
          <div className="flex flex-col gap-1.5">
            {FIELD_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => setArmedType(armedType === type ? null : type)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                  armedType === type
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-foreground-subtle">
            {armedType
              ? 'Click on the page to place the field.'
              : 'Pick a field type, then click the page. Drag to move; corner to resize.'}
          </p>
        </div>

        {selectedField && (
          <div className="space-y-2 rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">Selected field</p>
            <p className="text-sm">
              {FIELD_TYPES.find((t) => t.type === selectedField.fieldType)?.label}
              {' · page '}
              {selectedField.pageNumber + 1}
            </p>
            {(selectedField.fieldType === 'text' || selectedField.fieldType === 'checkbox') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedField.required}
                  onChange={(e) => updateField(selectedField.id, { required: e.target.checked })}
                />
                Required
              </label>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-destructive"
              onClick={() => removeField(selectedField.id)}
            >
              <Trash2 className="mr-1.5 size-3.5" /> Remove field
            </Button>
          </div>
        )}
      </div>

      {/* Pages */}
      <div
        className={cn(
          'min-w-0 flex-1 space-y-4 rounded-lg bg-surface-muted p-3 sm:p-4',
          armedType && 'cursor-crosshair',
        )}
      >
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {!pdf && !loadError && (
          <div className="flex items-center justify-center py-16 text-foreground-muted">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading document…
          </div>
        )}
        {pdf &&
          activeDocument &&
          Array.from({ length: pdf.numPages }, (_, pageIndex) => (
            <div key={pageIndex} className="mx-auto w-full max-w-3xl">
              <p className="mb-1 text-xs text-foreground-subtle">
                Page {pageIndex + 1} of {pdf.numPages}
              </p>
              <PdfPageCanvas
                pdf={pdf}
                pageNumber={pageIndex + 1}
                overlay={(size) => (
                  <div
                    className="absolute inset-0"
                    onPointerDown={(e) => {
                      if (!armedType) {
                        setSelectedFieldId(null)
                        return
                      }
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      placeField(
                        pageIndex,
                        (e.clientX - rect.left) / rect.width,
                        (e.clientY - rect.top) / rect.height,
                      )
                    }}
                  >
                    {fields
                      .filter((f) => f.documentId === activeDocument.id && f.pageNumber === pageIndex)
                      .map((field) => {
                        const idx = participantIndexById.get(field.participantId) ?? 0
                        const color = participantColor(idx)
                        const isSelected = field.id === selectedFieldId
                        return (
                          <div
                            key={field.id}
                            role="button"
                            tabIndex={0}
                            onPointerDown={(e) => onFieldPointerDown(e, field, 'move', size)}
                            onPointerMove={onFieldPointerMove}
                            onPointerUp={onFieldPointerUp}
                            onKeyDown={(e) => {
                              if (e.key === 'Delete' || e.key === 'Backspace') removeField(field.id)
                            }}
                            className={cn(
                              'absolute flex items-center justify-center overflow-hidden rounded-sm border text-[10px] font-medium leading-none',
                              'touch-none select-none',
                              isSelected && 'ring-2 ring-offset-1',
                            )}
                            style={{
                              left: field.posX * size.width,
                              top: field.posY * size.height,
                              width: field.width * size.width,
                              height: field.height * size.height,
                              borderColor: color.border,
                              backgroundColor: color.bg,
                              color: color.text,
                              cursor: 'move',
                            }}
                          >
                            <span className="pointer-events-none truncate px-1">
                              {FIELD_TYPE_SHORT[field.fieldType]}
                            </span>
                            {/* resize handle */}
                            <span
                              onPointerDown={(e) => onFieldPointerDown(e, field, 'resize', size)}
                              onPointerMove={onFieldPointerMove}
                              onPointerUp={onFieldPointerUp}
                              className="absolute bottom-0 right-0 size-2.5 touch-none"
                              style={{
                                cursor: 'nwse-resize',
                                background: `linear-gradient(135deg, transparent 50%, ${color.border} 50%)`,
                              }}
                              aria-hidden
                            />
                          </div>
                        )
                      })}
                  </div>
                )}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
