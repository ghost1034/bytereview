import { describe, expect, it } from 'vitest'
import { normalizeUnknownError } from './errors'

describe('normalizeUnknownError', () => {
  it('preserves real errors', () => {
    const original = new Error('specific failure')
    expect(normalizeUnknownError(original, 'fallback')).toBe(original)
  })

  it('turns browser event rejections into a useful Error', () => {
    const event = new Event('error')
    const result = normalizeUnknownError(event, 'Dashboard export failed')

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('Dashboard export failed')
    expect((result as Error & { cause?: unknown }).cause).toBe(event)
    expect(String(result)).not.toContain('[object Event]')
  })
})
