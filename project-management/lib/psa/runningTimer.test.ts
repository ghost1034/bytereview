import { describe, expect, it } from 'vitest'
import { elapsedTimerSeconds } from './elapsedTimer'

describe('running timer elapsed capture', () => {
  it('captures whole elapsed seconds from persisted timestamps', () => {
    expect(elapsedTimerSeconds('2026-08-12T10:00:00.000Z', '2026-08-12T11:02:03.900Z')).toBe(3723)
  })

  it('does not produce negative or invalid elapsed values', () => {
    expect(elapsedTimerSeconds('2026-08-12T11:00:00.000Z', '2026-08-12T10:00:00.000Z')).toBe(0)
    expect(elapsedTimerSeconds('invalid', '2026-08-12T10:00:00.000Z')).toBe(0)
  })
})
