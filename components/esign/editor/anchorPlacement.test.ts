import { describe, expect, it } from 'vitest'

import {
  anchorInstancesShareValue,
  anchorPreviewPosition,
  DEFAULT_ANCHOR_CROSS_AXIS_ALIGNMENT,
  DEFAULT_ANCHOR_RELATIVE_POSITION,
  resolveAnchorFieldType,
  serializeAnchorPosition,
} from './anchorPlacement'

describe('anchor placement field behavior', () => {
  it('defaults new searches and saved rules to Auto/Auto', () => {
    expect(DEFAULT_ANCHOR_RELATIVE_POSITION).toBe('auto')
    expect(DEFAULT_ANCHOR_CROSS_AXIS_ALIGNMENT).toBe('auto')
    expect(serializeAnchorPosition()).toEqual({
      relative_position: 'auto',
      cross_axis_alignment: 'auto',
    })
  })

  it('serializes selected placement and alignment independently', () => {
    expect(serializeAnchorPosition('above', 'end')).toEqual({
      relative_position: 'above',
      cross_axis_alignment: 'end',
    })
  })

  it('serializes center placement', () => {
    expect(serializeAnchorPosition('center', 'auto')).toEqual({
      relative_position: 'center',
      cross_axis_alignment: 'auto',
    })
  })

  it('uses server-computed coordinates for dashed previews', () => {
    expect(anchorPreviewPosition({ x: 0.25, y: 0.4 }, { width: 800, height: 1000 })).toEqual({
      left: 200,
      top: 400,
    })
  })

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
