import { describe, expect, it } from 'vitest'

import { formatDateSigned } from './dateSigned'

describe('formatDateSigned', () => {
  const date = new Date(2026, 6, 4)

  it.each([
    ['MM/DD/YYYY', '07/04/2026'],
    ['DD/MM/YYYY', '04/07/2026'],
    ['YYYY-MM-DD', '2026-07-04'],
    ['MMM D, YYYY', 'Jul 4, 2026'],
  ])('formats the signing date as %s', (format, expected) => {
    expect(formatDateSigned(date, format)).toBe(expected)
  })
})
