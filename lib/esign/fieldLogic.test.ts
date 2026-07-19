import { describe, expect, it } from 'vitest'
import vectors from '../../backend/tests/fixtures/field_logic_vectors.json'
import { conditionMatches, evaluateFormula, resolveVisibility, type ConditionalRule, type LogicField } from './fieldLogic'

describe('field logic parity vectors', () => {
  it('evaluates formulas safely', () => {
    for (const vector of vectors.formulas) expect(evaluateFormula(vector.expression, vector.values, vector.places)).toBe(vector.expected)
  })
  it('evaluates conditions', () => {
    const parent = { id: 'parent', field_type: 'text', properties: {} }
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
})
