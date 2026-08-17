import { describe, expect, it } from 'vitest'

import {
  createFormulaRecipe,
  formulaRecipeError,
  formulaRecipeExpression,
  recognizeFormulaRecipe,
  type FormulaRecipe,
} from './formulaBuilder'

describe('formula recipe builder', () => {
  it.each<[FormulaRecipe, string]>([
    [{ kind: 'sum', operands: [{ kind: 'field', fieldId: 'subtotal' }, { kind: 'value', value: '5', valueType: 'number' }] }, 'SUM([subtotal], 5)'],
    [{ kind: 'difference', left: { kind: 'field', fieldId: 'gross' }, right: { kind: 'field', fieldId: 'discount' } }, '[gross] - [discount]'],
    [{ kind: 'product', left: { kind: 'field', fieldId: 'hours' }, right: { kind: 'value', value: '125', valueType: 'number' } }, '[hours] * 125'],
    [{ kind: 'division', left: { kind: 'field', fieldId: 'total' }, right: { kind: 'field', fieldId: 'count' } }, '[total] / [count]'],
    [{ kind: 'percentage', base: { kind: 'field', fieldId: 'subtotal' }, percentage: '8.25' }, '([subtotal] * 8.25) / 100'],
    [{ kind: 'conditional', source: { kind: 'field', fieldId: 'amount' }, comparator: '>=', comparison: { kind: 'value', value: '100', valueType: 'number' }, whenTrue: { kind: 'value', value: 'Approved', valueType: 'text' }, whenFalse: { kind: 'value', value: 'Review', valueType: 'text' } }, "IF([amount] >= 100, 'Approved', 'Review')"],
    [{ kind: 'date_difference', startFieldId: 'start', endFieldId: 'end' }, "DATEDIFF([start], [end], 'days')"],
    [{ kind: 'date_add', dateFieldId: 'start', days: '30' }, "DATEADD([start], 30, 'days')"],
  ])('serializes and recognizes %#', (recipe, expression) => {
    expect(formulaRecipeExpression(recipe)).toBe(expression)
    expect(recognizeFormulaRecipe(expression)).toEqual(recipe)
  })

  it('creates useful defaults and identifies incomplete recipes', () => {
    expect(formulaRecipeExpression(createFormulaRecipe('sum', ['one', 'two']))).toBe('SUM([one], [two])')
    expect(formulaRecipeError(createFormulaRecipe('sum', []))).toMatch('Choose')
    expect(formulaRecipeError({ kind: 'percentage', base: { kind: 'field', fieldId: 'one' }, percentage: '' })).toMatch('percentage')
    expect(formulaRecipeError({ kind: 'division', left: { kind: 'field', fieldId: 'one' }, right: { kind: 'value', value: '0', valueType: 'number' } })).toMatch('zero')
    expect(formulaRecipeError({ kind: 'date_add', dateFieldId: 'date', days: '1.5' })).toMatch('whole number')
  })

  it('leaves arbitrary nested expressions in advanced mode', () => {
    expect(recognizeFormulaRecipe('ROUND(SUM([a], [b]) * 1.25, 2)')).toBeNull()
  })

  it('round-trips quoted text constants without changing their value', () => {
    const recipe: FormulaRecipe = { kind: 'conditional', source: { kind: 'field', fieldId: 'approved' }, comparator: '==', comparison: { kind: 'value', value: 'yes', valueType: 'text' }, whenTrue: { kind: 'value', value: "Manager's approval", valueType: 'text' }, whenFalse: { kind: 'value', value: 'Review', valueType: 'text' } }
    const expression = formulaRecipeExpression(recipe)

    expect(expression).toContain("Manager\\'s approval")
    expect(recognizeFormulaRecipe(expression)).toEqual(recipe)
  })
})
