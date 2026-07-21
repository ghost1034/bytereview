import { describe, expect, it } from 'vitest'

import type { EditorField } from './PdfFieldEditor'
import { supportsTextAppearance, type EditorFieldType } from './anchorPlacement'
import { getFloatingToolbarPosition } from './floatingToolbar'
import { configuredTextFontSize, textFontFamily } from './textAppearance'

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

describe('text field appearance support', () => {
  it.each<EditorFieldType>([
    'date_signed', 'text', 'auto_fill', 'dropdown', 'formula', 'date', 'number',
    'first_name', 'last_name', 'full_name', 'email', 'company', 'title', 'note',
  ])('allows alignment for %s fields', (fieldType) => {
    expect(supportsTextAppearance(fieldType)).toBe(true)
  })

  it.each<EditorFieldType>([
    'signature', 'initials', 'stamp', 'checkbox', 'radio', 'attachment',
  ])('does not offer text alignment for %s fields', (fieldType) => {
    expect(supportsTextAppearance(fieldType)).toBe(false)
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
})
