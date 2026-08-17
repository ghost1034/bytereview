import { describe, expect, it } from 'vitest'

import { dropdownOptionsFromText, FIELD_PREVIEW_LABELS, type EditorField } from './PdfFieldEditor'
import {
  DEFAULT_FIELD_VERTICAL_ALIGNMENT,
  defaultFieldHorizontalAlignment,
  supportsFieldAlignment,
  supportsTextAppearance,
  type EditorFieldType,
} from './anchorPlacement'
import { getFloatingToolbarPosition } from './floatingToolbar'
import {
  DEFAULT_TYPED_MARK_HEIGHT_RATIO,
  DEFAULT_TYPED_MARK_POINT_SIZE,
  configuredTextFontSize,
  signingTextFontSize,
  textFontFamily,
} from './textAppearance'

const field: EditorField = {
  id: 'field-1',
  documentId: 'document-1',
  participantId: 'participant-1',
  fieldType: 'text',
  pageNumber: 0,
  posX: 0.4,
  posY: 0.3,
  width: 0.2,
  height: 0.04,
  required: true,
}

describe('floating field toolbar positioning', () => {
  it('centers above a field when there is room', () => {
    expect(getFloatingToolbarPosition(field, 768, 994)).toMatchObject({
      width: 360,
      left: 204,
      top: 290.2,
      arrowLeft: 180,
      placement: 'above',
    })
  })

  it('flips below fields near the top of a page', () => {
    const position = getFloatingToolbarPosition({ ...field, posY: 0.01 }, 768, 994)

    expect(position.placement).toBe('below')
    expect(position.top).toBeCloseTo(57.7)
  })

  it('keeps the toolbar inside both horizontal page edges', () => {
    const left = getFloatingToolbarPosition({ ...field, posX: 0 }, 768, 994)
    const right = getFloatingToolbarPosition({ ...field, posX: 0.8 }, 768, 994)

    expect(left.left).toBe(8)
    expect(right.left + right.width).toBe(760)
  })
})

describe('field preview labels', () => {
  it('distinguishes signer-entered dates from automatic signing dates', () => {
    expect(FIELD_PREVIEW_LABELS.date).toBe('Date (signer enters)')
    expect(FIELD_PREVIEW_LABELS.date_signed).toBe('Date (date signed)')
  })
})

describe('text field appearance support', () => {
  it.each<EditorFieldType>([
    'date_signed', 'text', 'auto_fill', 'dropdown', 'formula', 'date', 'number',
    'first_name', 'last_name', 'full_name', 'email', 'company', 'title', 'note',
  ])('allows alignment for %s fields', (fieldType) => {
    expect(supportsTextAppearance(fieldType)).toBe(true)
  })

  it.each<EditorFieldType>([
    'signature', 'initials', 'stamp', 'checkbox', 'radio', 'attachment',
  ])('does not offer text typography for %s fields', (fieldType) => {
    expect(supportsTextAppearance(fieldType)).toBe(false)
  })

  it.each<EditorFieldType>([
    'signature', 'initials', 'stamp', 'date_signed', 'date', 'number', 'text',
    'first_name', 'last_name', 'full_name', 'email', 'company', 'title', 'note',
    'auto_fill', 'checkbox', 'radio', 'dropdown', 'attachment', 'formula',
  ])('offers horizontal and vertical alignment for %s fields', (fieldType) => {
    expect(supportsFieldAlignment(fieldType)).toBe(true)
  })

  it('preserves the legacy visual defaults', () => {
    expect(defaultFieldHorizontalAlignment('text')).toBe('left')
    expect(defaultFieldHorizontalAlignment('signature')).toBe('center')
    expect(DEFAULT_FIELD_VERTICAL_ALIGNMENT).toBe('middle')
  })
})

describe('configured text font rendering', () => {
  it('maps PDF-safe font names to browser font stacks', () => {
    expect(textFontFamily('Helvetica')).toContain('Arial')
    expect(textFontFamily('Times')).toContain('Times New Roman')
    expect(textFontFamily('Courier')).toContain('Courier New')
  })

  it('scales point sizes without overflowing the field', () => {
    expect(configuredTextFontSize(12, 1.5, 30)).toBe(18)
    expect(configuredTextFontSize(72, 1, 20)).toBe(18)
    expect(configuredTextFontSize(undefined, 1, 20)).toBeUndefined()
  })

  it('uses compact, scaled defaults in the signing interface', () => {
    expect(signingTextFontSize(undefined, 1.5, 30)).toBe(15)
    expect(signingTextFontSize(undefined, 2, 12)).toBe(6)
    expect(signingTextFontSize(12, 1.5, 30)).toBe(18)
  })

  it('uses the shared typed-mark default without overflowing its field', () => {
    expect(signingTextFontSize(
      undefined,
      1.5,
      30,
      DEFAULT_TYPED_MARK_POINT_SIZE,
      DEFAULT_TYPED_MARK_HEIGHT_RATIO,
    )).toBe(21)
  })
})

describe('dropdown option editing', () => {
  it('accepts newline-delimited options while ignoring a temporary blank line', () => {
    const existing = [{ value: 'option-1', label: 'Option 1' }]

    expect(dropdownOptionsFromText('Option 1\n', existing, () => 'new-option')).toEqual(existing)
    expect(dropdownOptionsFromText('Option 1\nOption 2', existing, () => 'new-option')).toEqual([
      ...existing,
      { value: 'new-option', label: 'Option 2' },
    ])
  })

  it('keeps existing option values stable when a line is inserted', () => {
    const existing = [
      { value: 'first', label: 'First' },
      { value: 'second', label: 'Second' },
    ]

    expect(dropdownOptionsFromText('First\nInserted\nSecond', existing, () => 'inserted')).toEqual([
      existing[0],
      { value: 'inserted', label: 'Inserted' },
      existing[1],
    ])
  })
})
