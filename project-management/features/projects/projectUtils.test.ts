import { describe, expect, it } from 'vitest'
import { activeProjectViews, normalizeProjectView, PROJECT_VIEWS, VIEW_LABELS } from './projectUtils'

describe('Phase 4 project views', () => {
  it('keeps Timeline and Gantt distinct while preserving legacy query values', () => {
    expect(normalizeProjectView('timeline')).toBe('timeline')
    expect(normalizeProjectView('gantt')).toBe('gantt')
    expect(VIEW_LABELS.timeline).toBe('Timeline')
    expect(VIEW_LABELS.gantt).toBe('Gantt')
  })

  it('enables all five core work views by default without duplicates', () => {
    expect(PROJECT_VIEWS).toEqual(['list', 'board', 'calendar', 'timeline', 'gantt'])
    expect(activeProjectViews(['timeline', 'gantt', 'timeline'])).toEqual(['timeline', 'gantt'])
  })
})
