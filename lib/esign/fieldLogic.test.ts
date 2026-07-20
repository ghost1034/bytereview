import { describe, expect, it } from 'vitest'
import vectors from '../../backend/tests/fixtures/field_logic_vectors.json'
import { conditionMatches, evaluateFormula, fieldValueError, incompleteFields, resolveVisibility, type ConditionalRule, type LogicField } from './fieldLogic'

describe('field logic parity vectors', () => {
  it('evaluates formulas safely', () => {
    for (const vector of vectors.formulas) expect(evaluateFormula(vector.expression, vector.values, vector.places)).toBe(vector.expected)
  })
  it('evaluates conditions', () => {
    const parent: LogicField = { id: 'parent', field_type: 'text', properties: {} }
    for (const vector of vectors.conditions) {
      expect(conditionMatches({ parent_field_id: 'parent', operator: vector.operator as ConditionalRule['operator'], values: vector.values }, parent, [parent], { parent: vector.current })).toBe(vector.expected)
    }
  })
  it('propagates hidden parents', () => {
    const fields: LogicField[] = [
      { id: 'a', field_type: 'text', properties: {} },
      { id: 'b', field_type: 'text', properties: { conditional: { parent_field_id: 'a', operator: 'equals', values: ['yes'], action: 'show' } } },
      { id: 'c', field_type: 'text', properties: { conditional: { parent_field_id: 'b', operator: 'not_empty', values: [], action: 'show' } } },
    ]
    expect(resolveVisibility(fields, { a: 'no', b: 'value' })).toEqual({ a: true, b: false, c: false })
  })
  it('supports stable labels, safe functions, and per-instance signatures', () => {
    expect(evaluateFormula('IF([amount] >= 10, ROUND([amount] * 1.25, 1), 0)', { amount: '12' }, 2)).toBe('15.00')
    expect(evaluateFormula("DATEDIFF([start], DATEADD([start], 5, 'days'))", { start: '2026-07-01' }, 0)).toBe('5')
    expect(evaluateFormula('IF(0, 1 / 0, 2)', {}, 0)).toBe('2')
    const fields: LogicField[] = [
      { id: 'required', field_type: 'signature', required: true },
      { id: 'optional', field_type: 'stamp', required: false },
    ]
    expect(incompleteFields(fields, {}, true).map((field) => field.id)).toEqual(['required'])
    expect(incompleteFields(fields, { required: 'true' }, true)).toEqual([])
  })
  it('keeps checkbox selection groups independent from shared data labels', () => {
    const fields: LogicField[] = [
      { id: 'a', field_type: 'checkbox', required: false, properties: { data_label: 'shared', shared_value: true, selection_group: { id: 'choices', label: 'Choices', minimum_selected: 1, maximum_selected: 1 } } },
      { id: 'b', field_type: 'checkbox', required: false, properties: { data_label: 'other', selection_group: { id: 'choices', label: 'Choices', minimum_selected: 1, maximum_selected: 1 } } },
    ]
    expect(incompleteFields(fields, {}, false).map((field) => field.id)).toEqual(['a'])
    expect(incompleteFields(fields, { b: 'true' }, false)).toEqual([])
    expect(incompleteFields(fields, { a: 'true', b: 'true' }, false).map((field) => field.id)).toEqual(['a'])
  })
  it('uses strict decimal and ISO-date input parsing', () => {
    expect(fieldValueError({ id: 'n', field_type: 'number' }, '1e2')).toBe('Enter a decimal number')
    expect(fieldValueError({ id: 'n', field_type: 'number' }, '-1.25')).toBeNull()
    expect(fieldValueError({ id: 'd', field_type: 'date' }, '2026-02-30')).toBe('Enter a valid date')
    expect(fieldValueError({ id: 'd', field_type: 'date' }, '2026-02-28')).toBeNull()
  })
})
