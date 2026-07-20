import type { AdoptedSignature } from '@/components/esign/sign/SignatureAdoptionModal'
import type { EsignFieldType } from './fieldLogic'

interface CeremonyField {
  id: string
  field_type: EsignFieldType
  draft_value?: string | null
  properties?: {
    sender_prefill?: string | null
    auto_source?: string | null
  } | null
}

interface CeremonySession {
  fields?: CeremonyField[]
  attachments?: Array<{ id: string; field_id: string }>
  recipient_name?: string | null
  recipient_email?: string | null
  recipient_company?: string | null
  sent_at?: string | null
  draft_marks?: MarkBundle | null
}

interface MarkArtifact {
  signature_type: 'drawn' | 'typed' | 'uploaded'
  image_data_url?: string | null
  typed_text?: string | null
  typed_font?: string | null
}

export interface MarkBundle {
  signature?: MarkArtifact | null
  initials?: MarkArtifact | null
  stamp?: MarkArtifact | null
}

/** One initializer for authenticated and guest ceremonies. Drafts win over defaults. */
export function initializeCeremonyState(session: CeremonySession): Record<string, string> {
  const values: Record<string, string> = {}
  const name = session.recipient_name ?? ''
  const names = name.trim().split(/\s+/).filter(Boolean)
  for (const attachment of session.attachments ?? []) values[attachment.field_id] = attachment.id
  for (const field of session.fields ?? []) {
    const prefill = field.properties?.sender_prefill
    if (prefill != null) values[field.id] = prefill
    if (field.field_type === 'first_name') values[field.id] = names[0] ?? ''
    else if (field.field_type === 'last_name') values[field.id] = names[names.length - 1] ?? ''
    else if (field.field_type === 'full_name') values[field.id] = name
    else if (field.field_type === 'email') values[field.id] = session.recipient_email ?? ''
    else if (field.field_type === 'company') values[field.id] = session.recipient_company ?? ''
    else if (field.field_type === 'auto_fill') {
      const source = field.properties?.auto_source
      if (source === 'recipient_name') values[field.id] = name
      else if (source === 'recipient_email') values[field.id] = session.recipient_email ?? ''
      else if (source === 'company') values[field.id] = session.recipient_company ?? ''
      else if (source === 'date_sent' && session.sent_at) values[field.id] = new Date(session.sent_at).toISOString().slice(0, 10)
    }
    if (field.draft_value != null) values[field.id] = field.draft_value
  }
  return values
}

export function adoptedToMarks(adopted: AdoptedSignature | null): MarkBundle | undefined {
  if (!adopted) return undefined
  const imageType = adopted.signatureType === 'typed' ? undefined : adopted.signatureType
  const hasSignature = adopted.signatureType === 'typed'
    ? !!adopted.typedText?.trim()
    : !!adopted.imageDataUrl
  return {
    signature: hasSignature ? {
      signature_type: adopted.signatureType,
      image_data_url: adopted.imageDataUrl,
      typed_text: adopted.typedText,
      typed_font: adopted.typedFont,
    } : undefined,
    initials: adopted.initialsImageDataUrl && imageType
      ? { signature_type: imageType, image_data_url: adopted.initialsImageDataUrl }
      : { signature_type: 'typed', typed_text: adopted.initialsText, typed_font: adopted.typedFont },
    stamp: adopted.stampImageDataUrl && adopted.stampType
      ? { signature_type: adopted.stampType, image_data_url: adopted.stampImageDataUrl }
      : undefined,
  }
}

export function marksToAdopted(marks: MarkBundle | null | undefined): AdoptedSignature | null {
  if (!marks) return null
  const signature = marks.signature
  const initials = marks.initials
  const stamp = marks.stamp
  if (!signature && !initials && !stamp) return null
  return {
    signatureType: signature?.signature_type ?? 'typed',
    imageDataUrl: signature?.image_data_url ?? undefined,
    typedText: signature?.typed_text ?? '',
    typedFont: signature?.typed_font ?? initials?.typed_font ?? undefined,
    initialsText: initials?.typed_text ?? '',
    initialsImageDataUrl: initials?.image_data_url ?? undefined,
    stampType: stamp?.signature_type === 'drawn' || stamp?.signature_type === 'uploaded' ? stamp.signature_type : undefined,
    stampImageDataUrl: stamp?.image_data_url ?? undefined,
  }
}
