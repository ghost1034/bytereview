import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ChoiceRowsEditor } from './PdfFieldEditor'

const choices = [{ id: 'choice-1', label: 'Choice 1' }]

describe('choice row layout', () => {
  it('stacks option inputs above their controls in the compact sidebar layout', () => {
    const markup = renderToStaticMarkup(
      <ChoiceRowsEditor
        choices={choices}
        defaultIds={[]}
        compact
        onChange={vi.fn()}
        onDefaultsChange={vi.fn()}
      />,
    )

    expect(markup).toContain('grid-cols-[minmax(0,1fr)_auto_auto_auto]')
    expect(markup).toMatch(/aria-label="Choice 1"[^>]*class="[^"]*col-span-4/)
  })

  it('keeps the wider setup dialog layout inline', () => {
    const markup = renderToStaticMarkup(
      <ChoiceRowsEditor
        choices={choices}
        defaultIds={[]}
        onChange={vi.fn()}
        onDefaultsChange={vi.fn()}
      />,
    )

    expect(markup).not.toContain('grid-cols-[minmax(0,1fr)_auto_auto_auto]')
    expect(markup).not.toContain('col-span-4')
  })
})
