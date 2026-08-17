'use client'

import * as React from 'react'
import { Loader2, Paperclip, PenLine, Trash2 } from 'lucide-react'

import { openPdfFromUrl, participantColor, type PdfDocument } from '@/components/esign/pdf'
import { PdfPageCanvas } from '@/components/esign/PdfPageCanvas'
import {
  DEFAULT_FIELD_VERTICAL_ALIGNMENT,
  defaultFieldHorizontalAlignment,
} from '@/components/esign/editor/anchorPlacement'
import {
  DEFAULT_TYPED_MARK_HEIGHT_RATIO,
  DEFAULT_TYPED_MARK_POINT_SIZE,
  signingTextFontSize,
  textFontFamily,
} from '@/components/esign/editor/textAppearance'
import { formatDateSigned } from '@/components/esign/sign/dateSigned'
import {
  signatureFontFamily,
  type AdoptedSignature,
} from '@/components/esign/sign/SignatureAdoptionModal'
import type { EsignFieldResponse, EsignSignerAttachmentResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

interface SigningDocumentViewerProps {
  url: string
  name: string
  fields: EsignFieldResponse[]
  fieldValues: Record<string, string>
  adopted: AdoptedSignature | null
  activeFieldId: string | null
  onFieldClick: (field: EsignFieldResponse) => void
  onTextChange: (fieldId: string, value: string) => void
  attachments: EsignSignerAttachmentResponse[]
  onAttachmentUpload: (fieldId: string, file: File) => void
  onAttachmentDelete: (attachmentId: string) => void
  dateFormat?: string
  fieldErrors?: Record<string, string>
}

/** The shared inline PDF field UI used by authenticated and guest signers. */
export function SigningDocumentViewer({
  url,
  name,
  fields,
  fieldValues,
  adopted,
  activeFieldId,
  onFieldClick,
  onTextChange,
  attachments,
  onAttachmentUpload,
  onAttachmentDelete,
  dateFormat = 'MM/DD/YYYY',
  fieldErrors = {},
}: SigningDocumentViewerProps) {
  const [pdf, setPdf] = React.useState<PdfDocument | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    openPdfFromUrl(url)
      .then((document) => {
        if (!cancelled) setPdf(document)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load PDF')
      })
    return () => { cancelled = true }
  }, [url])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!pdf) return <div className="flex items-center justify-center py-16 text-foreground-muted"><Loader2 className="mr-2 size-4 animate-spin" /> Loading {name}…</div>

  const color = participantColor(0)
  return <div className="space-y-4">
    {Array.from({ length: pdf.numPages }, (_, pageIndex) => <div key={pageIndex} className="mx-auto w-full max-w-3xl">
      <PdfPageCanvas pdf={pdf} pageNumber={pageIndex + 1} overlay={(size) => <div className="absolute inset-0">
        {fields.filter((field) => field.page_number === pageIndex).map((field) => {
          const pdfFontSize = field.properties?.appearance?.font_size
          const renderedFieldHeight = field.height * size.height
          const horizontalAlignment = field.properties?.appearance?.alignment
            ?? defaultFieldHorizontalAlignment(field.field_type)
          const verticalAlignment = field.properties?.appearance?.vertical_alignment
            ?? DEFAULT_FIELD_VERTICAL_ALIGNMENT
          const renderedFontSize = signingTextFontSize(
            pdfFontSize,
            size.scale,
            renderedFieldHeight,
          )
          const verticalSpace = Math.max(0, renderedFieldHeight - renderedFontSize * 1.2 - 4)
          const controlVerticalPadding = verticalAlignment === 'top'
            ? { paddingTop: 2, paddingBottom: verticalSpace + 2 }
            : verticalAlignment === 'bottom'
              ? { paddingTop: verticalSpace + 2, paddingBottom: 2 }
              : { paddingTop: verticalSpace / 2 + 2, paddingBottom: verticalSpace / 2 + 2 }
          const style: React.CSSProperties = {
            left: field.pos_x * size.width,
            top: field.pos_y * size.height,
            width: field.width * size.width,
            height: field.height * size.height,
            color: field.properties?.appearance?.color ?? undefined,
            fontSize: renderedFontSize,
            fontFamily: textFontFamily(field.properties?.appearance?.font),
            fontWeight: field.properties?.appearance?.bold ? 700 : undefined,
            fontStyle: field.properties?.appearance?.italic ? 'italic' : undefined,
            textDecoration: field.properties?.appearance?.underline ? 'underline' : undefined,
            textAlign: horizontalAlignment,
            justifyContent: horizontalAlignment === 'left' ? 'flex-start' : horizontalAlignment === 'right' ? 'flex-end' : 'center',
            alignItems: verticalAlignment === 'top' ? 'flex-start' : verticalAlignment === 'bottom' ? 'flex-end' : 'center',
          }
          const activeRing = field.id === activeFieldId ? 'ring-2 ring-warning ring-offset-1' : ''
          const tooltip = field.properties?.tooltip ?? field.label ?? undefined

          if (['signature', 'initials', 'stamp'].includes(field.field_type)) {
            const complete = !!adopted && fieldValues[field.id] === 'true'
            const isInitials = field.field_type === 'initials'
            const isStamp = field.field_type === 'stamp'
            const renderedMarkFontSize = signingTextFontSize(
              pdfFontSize,
              size.scale,
              renderedFieldHeight,
              DEFAULT_TYPED_MARK_POINT_SIZE,
              DEFAULT_TYPED_MARK_HEIGHT_RATIO,
            )
            const imageUrl = isStamp
              ? adopted?.stampImageDataUrl
              : isInitials
              ? adopted?.initialsImageDataUrl
              : adopted?.signatureType !== 'typed' ? adopted?.imageDataUrl : undefined
            return <button key={field.id} id={`esign-field-${field.id}`} type="button" onClick={() => onFieldClick(field)}
              className={cn('absolute flex items-center justify-center overflow-hidden rounded-sm border text-xs font-medium transition-colors', complete ? 'border-success bg-white' : 'animate-none border-2', activeRing)}
              title={tooltip} style={{ ...style, fontSize: complete ? renderedMarkFontSize : undefined, ...(complete ? {} : { borderColor: color.border, backgroundColor: color.bg, color: color.text }) }}>
              {complete ? imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl} alt={isStamp ? 'Your stamp' : isInitials ? 'Your initials' : 'Your signature'} className="max-h-full max-w-full object-contain" />
                : <span className="truncate px-1 leading-none text-foreground" style={{ fontFamily: signatureFontFamily(adopted?.typedFont) }}>{isInitials ? adopted?.initialsText : adopted?.typedText}</span>
                : <span className="inline-flex items-center gap-1 truncate px-1"><PenLine className="size-3.5" />{isInitials ? 'Initial' : field.field_type === 'stamp' ? 'Apply stamp' : 'Sign here'}</span>}
            </button>
          }
          if (field.field_type === 'date_signed') {
            return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border border-border bg-surface-muted px-1 text-xs text-foreground-muted" style={style} title={tooltip ?? 'The server records the actual completion date'}>{formatDateSigned(new Date(), dateFormat)}</div>
          }
          if (field.properties?.read_only && ['checkbox', 'radio', 'dropdown'].includes(field.field_type)) {
            const raw = fieldValues[field.id] ?? field.properties.sender_prefill ?? ''
            const display = field.field_type === 'dropdown'
              ? field.properties.options?.find((option) => option.value === raw)?.label ?? raw
              : raw === 'true' ? (field.field_type === 'checkbox' ? 'X' : '●') : ''
            return <div key={field.id} id={`esign-field-${field.id}`} title={tooltip} className="absolute flex items-center justify-center overflow-hidden rounded-sm border bg-surface-muted px-1 text-xs text-foreground" style={style}>{display}</div>
          }
          if (field.field_type === 'checkbox') {
            const checked = fieldValues[field.id] === 'true'
            return <button key={field.id} id={`esign-field-${field.id}`} title={tooltip} aria-label={field.label || field.properties?.selection_group?.label || 'Checkbox'} aria-pressed={checked} type="button" onClick={() => onTextChange(field.id, checked ? 'false' : 'true')} className={cn('absolute flex items-center justify-center rounded-sm border text-sm font-bold', checked ? 'border-success bg-surface text-foreground' : 'border-2', activeRing)} style={{ ...style, ...(checked ? {} : { borderColor: color.border, backgroundColor: color.bg }) }}>{checked ? 'X' : ''}</button>
          }
          if (field.field_type === 'radio') {
            const selected = fieldValues[field.id] === 'true'
            return <button key={field.id} id={`esign-field-${field.id}`} type="button" aria-pressed={selected} aria-label={field.label || field.properties?.option_value || 'Radio option'} onClick={() => {
              const group = field.properties?.group?.id
              fields.filter((item) => item.field_type === 'radio' && item.properties?.group?.id === group).forEach((item) => onTextChange(item.id, item.id === field.id ? 'true' : 'false'))
            }} className={cn('absolute flex items-center justify-center rounded-full border-2', activeRing)} style={{ ...style, borderColor: color.border, backgroundColor: 'white' }}>{selected && <span className="size-2/3 rounded-full" style={{ backgroundColor: color.border }} />}</button>
          }
          if (field.field_type === 'dropdown') {
            return <select key={field.id} id={`esign-field-${field.id}`} title={tooltip} aria-label={field.label || 'Select an option'} value={fieldValues[field.id] ?? ''} onChange={(event) => onTextChange(field.id, event.target.value)} className={cn('absolute rounded-sm border-2 bg-surface px-1 text-xs text-foreground', activeRing)} style={{ ...style, ...controlVerticalPadding, boxSizing: 'border-box', borderColor: color.border }}><option value="">Select…</option>{(field.properties?.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          }
          if (field.field_type === 'attachment') {
            const attachment = attachments.find((item) => item.field_id === field.id)
            return <div key={field.id} id={`esign-field-${field.id}`} className={cn('absolute flex items-center gap-1 overflow-hidden rounded-sm border-2 bg-surface px-1 text-[10px] text-foreground', activeRing)} style={{ ...style, borderColor: color.border }}>
              {attachment ? <><Paperclip className="size-3 shrink-0" /><span className="truncate">{attachment.original_filename}</span><button type="button" onClick={() => onAttachmentDelete(attachment.id)} aria-label="Remove attachment"><Trash2 className="size-3" /></button></>
                : <label title={tooltip} className="flex h-full w-full cursor-pointer gap-1" style={{ justifyContent: style.justifyContent, alignItems: style.alignItems }}><Paperclip className="size-3" /> Attach file<input type="file" className="hidden" accept={(field.properties?.allowed_types ?? ['application/pdf', 'image/png', 'image/jpeg']).join(',')} onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttachmentUpload(field.id, file) }} /></label>}
            </div>
          }
          if (field.field_type === 'formula') return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border bg-surface px-1 text-xs text-foreground" style={style}>{fieldValues[field.id] ?? ''}</div>
          if (field.field_type === 'auto_fill' && field.properties?.auto_source !== 'company') {
            const value = fieldValues[field.id] ?? ''
            const display = field.properties?.auto_source === 'date_sent' && value ? formatDateSigned(new Date(`${value}T00:00:00`), dateFormat) : value
            return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border bg-surface-muted px-1 text-xs text-foreground" style={style}>{display}</div>
          }
          if (field.field_type === 'note' || field.properties?.read_only || ['first_name', 'last_name', 'full_name', 'email'].includes(field.field_type)) return <div key={field.id} id={`esign-field-${field.id}`} className="absolute flex items-center overflow-hidden rounded-sm border bg-surface-muted px-1 text-xs text-foreground" style={style}>{fieldValues[field.id] ?? field.properties?.sender_prefill ?? ''}</div>
          const controlProps = {
            id: `esign-field-${field.id}`, title: tooltip,
            value: fieldValues[field.id] ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onTextChange(field.id, event.target.value),
            placeholder: field.label || 'Text',
            'aria-invalid': !!fieldErrors[field.id],
            'aria-describedby': fieldErrors[field.id] ? `esign-error-${field.id}` : undefined,
            className: cn('absolute rounded-sm border-2 bg-surface px-1 text-xs text-foreground focus:outline-none', activeRing, fieldErrors[field.id] && 'border-destructive'),
            style: { ...style, ...controlVerticalPadding, boxSizing: 'border-box' as const, borderColor: fieldErrors[field.id] ? undefined : color.border },
          }
          if (field.field_type === 'text' && field.properties?.multiline) return <textarea key={field.id} {...controlProps} />
          return <input key={field.id} {...controlProps} type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'} min={field.field_type === 'date' ? field.properties?.date_validation?.minimum ?? undefined : field.field_type === 'number' && field.properties?.number_validation?.minimum != null ? String(field.properties.number_validation.minimum) : undefined} max={field.field_type === 'date' ? field.properties?.date_validation?.maximum ?? undefined : field.field_type === 'number' && field.properties?.number_validation?.maximum != null ? String(field.properties.number_validation.maximum) : undefined} step={field.field_type === 'number' && field.properties?.number_validation?.decimal_places != null ? String(10 ** -field.properties.number_validation.decimal_places) : undefined} />
        })}
      </div>} />
    </div>)}
  </div>
}
