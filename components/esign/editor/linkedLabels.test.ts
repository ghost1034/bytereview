import { describe, expect, it } from 'vitest'

import type { EditorField } from './PdfFieldEditor'
import { choiceLabelsEnabled, reconcileLinkedLabels, setChoiceLabelsEnabled } from './linkedLabels'

const dropdown: EditorField = {
  id: 'dropdown', documentId: 'document', participantId: 'recipient', fieldType: 'dropdown', pageNumber: 0,
  posX: 0.9, posY: 0.01, width: 0.09, height: 0.04, required: true, label: 'Entity type',
  properties: { options: [{ value: 'llc', label: 'LLC' }] },
}

const radio = (id: string, label: string, x: number): EditorField => ({
  id, documentId: 'document', participantId: 'recipient', fieldType: 'radio', pageNumber: 0,
  posX: x, posY: 0.5, width: 0.03, height: 0.022, required: true, label,
  properties: { group: { id: 'entity', label: 'Entity type' }, option_value: id },
})

describe('generated document labels', () => {
  it('defaults off and creates a bounded dropdown question label when enabled', () => {
    expect(choiceLabelsEnabled([dropdown], dropdown)).toBe(false)
    const fields = setChoiceLabelsEnabled([dropdown], dropdown, true, () => 'dropdown-label')
    const label = fields.find((field) => field.id === 'dropdown-label')!

    expect(label.properties?.label_link).toEqual({ kind: 'field', source_id: 'dropdown', enabled: true })
    expect(label.properties?.sender_prefill).toBe('Entity type')
    expect(label.posX + label.width).toBeLessThanOrEqual(1)
    expect(label.posY).toBeGreaterThanOrEqual(0)
  })

  it('creates group and choice labels, synchronizes names, and preserves geometry while hidden', () => {
    let sequence = 0
    const members = [radio('yes', 'Yes', 0.94), radio('no', 'No', 0.2)]
    let fields = setChoiceLabelsEnabled(members, members[0], true, () => `label-${++sequence}`)
    expect(fields.filter((field) => field.fieldType === 'note')).toHaveLength(3)
    expect(fields.filter((field) => field.fieldType === 'note').every((field) => field.posX >= 0 && field.posX + field.width <= 1)).toBe(true)

    const yesLabel = fields.find((field) => field.properties?.label_link?.source_id === 'yes')!
    const originalBox = [yesLabel.posX, yesLabel.posY, yesLabel.width, yesLabel.height]
    fields = fields.map((field) => field.id === 'yes' ? { ...field, label: 'Absolutely' } : field)
    fields = reconcileLinkedLabels(fields, () => `label-${++sequence}`)
    expect(fields.find((field) => field.id === yesLabel.id)?.properties?.sender_prefill).toBe('Absolutely')

    fields = setChoiceLabelsEnabled(fields, fields.find((field) => field.id === 'yes')!, false, () => `label-${++sequence}`)
    expect(fields.filter((field) => field.fieldType === 'note').every((field) => field.properties?.label_link?.enabled === false)).toBe(true)
    expect(fields.find((field) => field.id === yesLabel.id)).toMatchObject({ posX: originalBox[0], posY: originalBox[1], width: originalBox[2], height: originalBox[3] })
  })

  it('removes orphan labels and creates a disabled label for a choice added while labels are hidden', () => {
    let sequence = 0
    const members = [radio('yes', 'Yes', 0.1), radio('no', 'No', 0.2)]
    let fields = setChoiceLabelsEnabled(members, members[0], false, () => `label-${++sequence}`)
    const added = radio('maybe', 'Maybe', 0.3)
    fields = reconcileLinkedLabels([...fields, added], () => `label-${++sequence}`)
    expect(fields.find((field) => field.properties?.label_link?.source_id === 'maybe')?.properties?.label_link?.enabled).toBe(false)

    fields = reconcileLinkedLabels(fields.filter((field) => field.id !== 'maybe'), () => `label-${++sequence}`)
    expect(fields.some((field) => field.properties?.label_link?.source_id === 'maybe')).toBe(false)
  })
})
