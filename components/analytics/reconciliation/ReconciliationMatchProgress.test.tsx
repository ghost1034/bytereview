import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ReconciliationMatchProgress } from './ReconciliationMatchProgress'

describe('ReconciliationMatchProgress', () => {
  it('shows indeterminate matching status without synthetic pass progress', () => {
    const markup = renderToStaticMarkup(
      <ReconciliationMatchProgress configuredPassCount={4} />,
    )

    expect(markup).toContain('Matching in progress')
    expect(markup).toContain('Submitted 4 configured passes')
    expect(markup).toContain('role="status"')
    expect(markup).not.toMatch(/Pass \d+ of \d+/)
    expect(markup).not.toContain('role="progressbar"')
  })
})
