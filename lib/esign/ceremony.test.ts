import { describe, expect, it } from 'vitest'
import { adoptedToMarks, initializeCeremonyState, marksToAdopted, mergeCeremonyState } from './ceremony'

describe('shared signing ceremony state', () => {
  it('uses identical defaults and lets resumed drafts win', () => {
    const values = initializeCeremonyState({
      recipient_name: 'Ada Lovelace', recipient_email: 'ada@example.test', recipient_company: null,
      sent_at: '2026-07-20T20:00:00Z', attachments: [{ id: 'upload', field_id: 'attachment' }],
      fields: [
        { id: 'name', field_type: 'full_name' },
        { id: 'email', field_type: 'auto_fill', properties: { auto_source: 'recipient_email' } },
        { id: 'company', field_type: 'auto_fill', properties: { auto_source: 'company' } },
        { id: 'date', field_type: 'auto_fill', properties: { auto_source: 'date_sent' } },
        { id: 'dropdown', field_type: 'dropdown', draft_value: 'draft-choice', properties: { sender_prefill: 'sender-choice' } },
      ],
    })
    expect(values).toMatchObject({
      name: 'Ada Lovelace', email: 'ada@example.test', company: '', date: '2026-07-20',
      dropdown: 'draft-choice', attachment: 'upload',
    })
  })

  it('round-trips three independent adopted marks', () => {
    const adopted = {
      signatureType: 'typed' as const, typedText: 'Ada Lovelace', typedFont: 'caveat',
      initialsText: 'AL', stampType: 'uploaded' as const,
      stampImageDataUrl: 'data:image/png;base64,stamp',
    }
    const marks = adoptedToMarks(adopted)!
    expect(marks.signature?.typed_text).toBe('Ada Lovelace')
    expect(marks.initials?.typed_text).toBe('AL')
    expect(marks.stamp?.image_data_url).toContain('stamp')
    expect(marks.stamp?.image_data_url).not.toBe(marks.signature?.image_data_url)
    expect(marksToAdopted(marks)).toMatchObject(adopted)
  })

  it('does not turn an unchanged session rehydration into a local edit', () => {
    const previous = { name: 'Ada Lovelace', note: 'Local edit' }
    const session = {
      recipient_name: 'Ada Lovelace',
      fields: [
        { id: 'name', field_type: 'full_name' as const },
        { id: 'note', field_type: 'text' as const, draft_value: 'Older server draft' },
      ],
    }

    expect(mergeCeremonyState(previous, session)).toBe(previous)

    const withNewDefault = mergeCeremonyState(previous, {
      ...session,
      fields: [...session.fields, { id: 'email', field_type: 'email' as const }],
      recipient_email: 'ada@example.test',
    })
    expect(withNewDefault).toEqual({ ...previous, email: 'ada@example.test' })
    expect(withNewDefault).not.toBe(previous)
  })
})
