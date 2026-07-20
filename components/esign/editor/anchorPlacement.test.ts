import { describe, expect, it } from 'vitest'

import { anchorInstancesShareValue, resolveAnchorFieldType } from './anchorPlacement'

describe('anchor placement field behavior', () => {
  it('preserves every selected field type, including radio and attachment', () => {
    expect(resolveAnchorFieldType('radio')).toBe('radio')
    expect(resolveAnchorFieldType('attachment')).toBe('attachment')
    expect(resolveAnchorFieldType('signature')).toBe('signature')
    expect(resolveAnchorFieldType(null)).toBe('text')
  })

  it('does not share instance-bound radio or attachment values', () => {
    expect(anchorInstancesShareValue('radio')).toBe(false)
    expect(anchorInstancesShareValue('attachment')).toBe(false)
    expect(anchorInstancesShareValue('signature')).toBe(false)
    expect(anchorInstancesShareValue('text')).toBe(true)
  })
})
