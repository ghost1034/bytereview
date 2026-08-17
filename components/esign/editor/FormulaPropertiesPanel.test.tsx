import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { EditorField } from './PdfFieldEditor'
import { FormulaPropertiesPanel } from './FormulaPropertiesPanel'

const amount: EditorField = {
  id: 'amount-field', documentId: 'document-1', participantId: 'recipient-1', fieldType: 'number',
  pageNumber: 0, posX: 0.1, posY: 0.1, width: 0.2, height: 0.03, required: true,
  label: 'Invoice amount', properties: { data_label: 'amount' },
}

function formula(expression: string): EditorField {
  return {
    id: 'formula-field', documentId: 'document-1', participantId: 'recipient-1', fieldType: 'formula',
    pageNumber: 0, posX: 0.1, posY: 0.2, width: 0.2, height: 0.03, required: false,
    label: 'Total due', properties: { data_label: 'total_due', formula: { expression, decimal_places: 2 } },
  }
}

describe('FormulaPropertiesPanel', () => {
  it('opens recognized formulas in the guided builder with sample inputs', () => {
    const field = formula('SUM([amount-field], 5)')
    const markup = renderToStaticMarkup(<FormulaPropertiesPanel field={field} fields={[amount, field]} onApply={vi.fn()} onCancel={vi.fn()} />)

    expect(markup).toMatch(/aria-selected="true"[^>]*>Guided<\/button>/)
    expect(markup).toContain('Invoice amount · page 1')
    expect(markup).toContain('Try sample values')
  })

  it('preserves arbitrary legacy expressions in Advanced mode', () => {
    const expression = 'ROUND(SUM([amount], 5) * 1.25, 2)'
    const field = formula(expression)
    const markup = renderToStaticMarkup(<FormulaPropertiesPanel field={field} fields={[amount, field]} onApply={vi.fn()} onCancel={vi.fn()} />)

    expect(markup).toMatch(/aria-selected="true"[^>]*>Advanced<\/button>/)
    expect(markup).toContain(expression)
  })

  it('labels staged configuration with an explicit commit action', () => {
    const field = formula('')
    const markup = renderToStaticMarkup(<FormulaPropertiesPanel field={field} fields={[amount]} isNew onApply={vi.fn()} onCancel={vi.fn()} />)

    expect(markup).toContain('Set up formula')
    expect(markup).toContain('Add formula')
  })
})
