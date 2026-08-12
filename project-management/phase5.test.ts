import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/tasklyticApi', () => ({
  TasklyticApiError: class TasklyticApiError extends Error {},
  tasklyticApiJson: vi.fn(),
  tasklyticApiFetch: vi.fn(),
  tasklyticEventFetch: vi.fn(),
}))
import type { Form, Goal, Task } from './types'
import { applyViewQuery, DEFAULT_VIEW_QUERY, migrateViewQuery } from './lib/query'
import { computeGoalProgress, weightedAverage } from './lib/goals/goalProgress'
import { resolveTaskEffortHours } from './lib/workload/effort'
import { isFormFieldVisible, validateFormAnswers } from './lib/forms/answerFormat'
import { TEMPLATE_LIBRARY } from './lib/templates/templateLibrary'
import { templatePlaceholderRoles, validateCuratedTemplates } from './lib/templates/templateValidation'

const timestamp = '2026-08-12T00:00:00.000Z'
const task = (id: string, name: string, completed = false): Task => ({
  id, workspaceId: 'w1', name, resourceSubtype: 'default_task', completed, collaboratorIds: [],
  projectIds: ['p1'], sectionIdByProject: {}, tagIds: [], customFieldValues: {}, dependencyIds: [],
  dependentIds: [], attachmentIds: [], likedByIds: [], createdAt: timestamp, modifiedAt: timestamp,
})
const goal = (id: string, patch: Partial<Goal> = {}): Goal => ({
  id, workspaceId: 'w1', name: id, ownerId: 'u1', timeFrame: { start: '2026-01-01', end: '2026-12-31' },
  metric: { type: 'percent', current: 0, target: 100 }, status: 'on_track', supportingProjectIds: [],
  supportingGoalIds: [], privacy: 'public', createdAt: timestamp, ...patch,
})

describe('Phase 5 advanced work management', () => {
  it('lazily migrates flat filters and evaluates nested AND/OR groups', () => {
    const migrated = migrateViewQuery({ ...DEFAULT_VIEW_QUERY, filters: [{ field: 'completed', op: 'eq', value: false }] })
    expect(migrated.filters).toEqual([])
    expect(migrated.filterExpression?.operator).toBe('and')
    const query = {
      ...migrated,
      filterExpression: {
        type: 'group' as const, operator: 'and' as const, children: [
          { type: 'group' as const, operator: 'or' as const, children: [
            { type: 'clause' as const, field: 'name', op: 'contains' as const, value: 'tax' },
            { type: 'clause' as const, field: 'name', op: 'contains' as const, value: 'audit' },
          ] },
          { type: 'clause' as const, field: 'completed', op: 'eq' as const, value: false },
        ],
      },
    }
    expect(applyViewQuery([task('1', 'Tax return'), task('2', 'Audit file'), task('3', 'Payroll'), task('4', 'Tax done', true)], query, 'p1').map((item) => item.id)).toEqual(['1', '2'])
  })

  it('rolls children and supporting goals up by weight and stops cycles', () => {
    const goals = [
      goal('parent'),
      goal('low', { parentGoalId: 'parent', rollupWeight: 1, metric: { type: 'percent', current: 20, target: 100 } }),
      goal('high', { parentGoalId: 'parent', rollupWeight: 3, metric: { type: 'percent', current: 100, target: 100 } }),
      goal('support', { metric: { type: 'percent', current: 50, target: 100 } }),
      goal('linked', { supportingGoalIds: ['support'], supportingGoalWeights: { support: 2 } }),
      goal('cycle-a', { supportingGoalIds: ['cycle-b'] }),
      goal('cycle-b', { supportingGoalIds: ['cycle-a'] }),
    ]
    expect(computeGoalProgress('parent', goals, []).percent).toBe(80)
    expect(computeGoalProgress('linked', goals, []).percent).toBe(50)
    expect(computeGoalProgress('cycle-a', goals, []).percent).toBe(0)
    expect(weightedAverage([{ percent: 10, weight: 1 }, { percent: 100, weight: 9 }])).toBe(91)
  })

  it('selects an explicit numeric effort field before conventional defaults', () => {
    const value = task('effort', 'Scoped task')
    value.customFieldValues = { estimate: { type: 'number', value: 4 }, selected: { type: 'number', value: 12 } }
    expect(resolveTaskEffortHours(value, 'estimate', 'selected')).toBe(12)
  })

  it('validates only visible public-form fields', () => {
    const form = {
      id: 'f1', projectId: 'p1', name: 'Intake', fields: [
        { id: 'kind', type: 'short_text' as const, label: 'Kind', required: true },
        { id: 'detail', type: 'short_text' as const, label: 'Detail', required: true, visibleIf: { fieldId: 'kind', op: 'eq' as const, value: 'tax' } },
      ], copyAnswersToDescription: false, isPublic: true, confirmationMessage: 'Thanks', createdAt: timestamp,
    } satisfies Form
    expect(isFormFieldVisible(form.fields[1], { kind: 'audit' })).toBe(false)
    expect(validateFormAnswers(form, { kind: 'audit' })).toBeNull()
    expect(validateFormAnswers(form, { kind: 'tax' })).toBe('Detail is required')
  })

  it('validates the complete curated catalog and exposes placeholder roles', () => {
    expect(TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(25)
    expect(validateCuratedTemplates(TEMPLATE_LIBRARY)).toEqual([])
    expect(templatePlaceholderRoles(TEMPLATE_LIBRARY[0]).length).toBeGreaterThan(0)
  })
})
