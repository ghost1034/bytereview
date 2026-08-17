export type FormulaOperand =
  | { kind: 'field'; fieldId: string }
  | { kind: 'value'; value: string; valueType: 'number' | 'text' }

export type FormulaRecipe =
  | { kind: 'sum'; operands: FormulaOperand[] }
  | { kind: 'difference' | 'product' | 'division'; left: FormulaOperand; right: FormulaOperand }
  | { kind: 'percentage'; base: FormulaOperand; percentage: string }
  | {
      kind: 'conditional'
      source: FormulaOperand
      comparator: '==' | '!=' | '>' | '<' | '>=' | '<='
      comparison: FormulaOperand
      whenTrue: FormulaOperand
      whenFalse: FormulaOperand
    }
  | { kind: 'date_difference'; startFieldId: string; endFieldId: string }
  | { kind: 'date_add'; dateFieldId: string; days: string }

export const FORMULA_RECIPE_LABELS: Record<FormulaRecipe['kind'], string> = {
  sum: 'Total',
  difference: 'Difference',
  product: 'Product',
  division: 'Division',
  percentage: 'Percentage',
  conditional: 'Conditional result',
  date_difference: 'Days between dates',
  date_add: 'Add days to a date',
}

const fieldOperand = (fieldId = ''): FormulaOperand => ({ kind: 'field', fieldId })

export function createFormulaRecipe(kind: FormulaRecipe['kind'], fieldIds: string[]): FormulaRecipe {
  const first = fieldIds[0] ?? ''
  const second = fieldIds[1] ?? first
  if (kind === 'sum') return { kind, operands: [fieldOperand(first), fieldOperand(second)] }
  if (kind === 'percentage') return { kind, base: fieldOperand(first), percentage: '10' }
  if (kind === 'conditional') return {
    kind,
    source: fieldOperand(first),
    comparator: '>=',
    comparison: { kind: 'value', value: '0', valueType: 'number' },
    whenTrue: fieldOperand(first),
    whenFalse: { kind: 'value', value: '0', valueType: 'number' },
  }
  if (kind === 'date_difference') return { kind, startFieldId: first, endFieldId: second }
  if (kind === 'date_add') return { kind, dateFieldId: first, days: '30' }
  return { kind, left: fieldOperand(first), right: fieldOperand(second) }
}

function quoted(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function formulaOperandExpression(operand: FormulaOperand): string {
  if (operand.kind === 'field') return operand.fieldId ? `[${operand.fieldId}]` : ''
  if (operand.valueType === 'number') return operand.value.trim()
  return quoted(operand.value)
}

export function formulaRecipeExpression(recipe: FormulaRecipe): string {
  if (recipe.kind === 'sum') return `SUM(${recipe.operands.map(formulaOperandExpression).join(', ')})`
  if (recipe.kind === 'difference') return `${formulaOperandExpression(recipe.left)} - ${formulaOperandExpression(recipe.right)}`
  if (recipe.kind === 'product') return `${formulaOperandExpression(recipe.left)} * ${formulaOperandExpression(recipe.right)}`
  if (recipe.kind === 'division') return `${formulaOperandExpression(recipe.left)} / ${formulaOperandExpression(recipe.right)}`
  if (recipe.kind === 'percentage') return `(${formulaOperandExpression(recipe.base)} * ${recipe.percentage.trim()}) / 100`
  if (recipe.kind === 'conditional') return `IF(${formulaOperandExpression(recipe.source)} ${recipe.comparator} ${formulaOperandExpression(recipe.comparison)}, ${formulaOperandExpression(recipe.whenTrue)}, ${formulaOperandExpression(recipe.whenFalse)})`
  if (recipe.kind === 'date_difference') return `DATEDIFF([${recipe.startFieldId}], [${recipe.endFieldId}], 'days')`
  if (recipe.kind === 'date_add') return `DATEADD([${recipe.dateFieldId}], ${recipe.days.trim()}, 'days')`
  return ''
}

const REF_OPERAND = /^\[([^\[\]]+)\]$/
const NUMBER_OPERAND = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/
const INTEGER_OPERAND = /^-?\d+$/
const TEXT_OPERAND = /^(['"])((?:\\.|.)*)\1$/

function parseOperand(source: string): FormulaOperand | null {
  const value = source.trim()
  const reference = REF_OPERAND.exec(value)
  if (reference) return fieldOperand(reference[1])
  if (NUMBER_OPERAND.test(value)) return { kind: 'value', value, valueType: 'number' }
  const text = TEXT_OPERAND.exec(value)
  if (text) return { kind: 'value', value: text[2].replace(/\\(['"\\])/g, '$1'), valueType: 'text' }
  return null
}

function splitArguments(source: string): string[] | null {
  const values: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote && source[index - 1] !== '\\') quote = ''
      continue
    }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) { values.push(source.slice(start, index).trim()); start = index + 1 }
    if (depth < 0) return null
  }
  if (quote || depth !== 0) return null
  values.push(source.slice(start).trim())
  return values
}

export function recognizeFormulaRecipe(expression: string): FormulaRecipe | null {
  const source = expression.trim()
  const sum = /^SUM\((.*)\)$/i.exec(source)
  if (sum) {
    const parts = splitArguments(sum[1])
    const operands = parts?.map(parseOperand) ?? []
    if (operands.length && operands.every(Boolean)) return { kind: 'sum', operands: operands as FormulaOperand[] }
  }
  const dateDifference = /^DATEDIFF\(\[([^\]]+)\],\s*\[([^\]]+)\](?:,\s*['"]days?['"])?\)$/i.exec(source)
  if (dateDifference) return { kind: 'date_difference', startFieldId: dateDifference[1], endFieldId: dateDifference[2] }
  const dateAdd = /^DATEADD\(\[([^\]]+)\],\s*(-?(?:\d+(?:\.\d*)?|\.\d+))(?:,\s*['"]days?['"])?\)$/i.exec(source)
  if (dateAdd) return { kind: 'date_add', dateFieldId: dateAdd[1], days: dateAdd[2] }
  const percentage = /^\((.+)\s+\*\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\)\s*\/\s*100$/.exec(source)
  if (percentage) {
    const base = parseOperand(percentage[1])
    if (base) return { kind: 'percentage', base, percentage: percentage[2] }
  }
  const conditional = /^IF\((.*)\)$/i.exec(source)
  if (conditional) {
    const parts = splitArguments(conditional[1])
    const comparison = parts?.[0]?.match(/^(.*?)\s*(>=|<=|!=|==|>|<)\s*(.*?)$/)
    if (parts?.length === 3 && comparison) {
      const sourceOperand = parseOperand(comparison[1])
      const comparisonOperand = parseOperand(comparison[3])
      const whenTrue = parseOperand(parts[1])
      const whenFalse = parseOperand(parts[2])
      if (sourceOperand && comparisonOperand && whenTrue && whenFalse) return {
        kind: 'conditional', source: sourceOperand,
        comparator: comparison[2] as Extract<FormulaRecipe, { kind: 'conditional' }>['comparator'],
        comparison: comparisonOperand, whenTrue, whenFalse,
      }
    }
  }
  for (const [operator, kind] of [['-', 'difference'], ['*', 'product'], ['/', 'division']] as const) {
    const parts = source.match(new RegExp(`^(.*?)\\s*\\${operator}\\s*(.*?)$`))
    if (!parts) continue
    const left = parseOperand(parts[1]); const right = parseOperand(parts[2])
    if (left && right) return { kind, left, right }
  }
  return null
}

export function formulaRecipeError(recipe: FormulaRecipe): string | null {
  const operandMissing = (operand: FormulaOperand) => operand.kind === 'field' ? !operand.fieldId : !operand.value.trim()
  if (recipe.kind === 'percentage' && !NUMBER_OPERAND.test(recipe.percentage.trim())) return 'Enter a valid percentage.'
  if (recipe.kind === 'date_add' && !INTEGER_OPERAND.test(recipe.days.trim())) return 'Enter a whole number of days.'
  if (recipe.kind === 'sum' && recipe.operands.length < 2) return 'Choose at least two values to total.'
  if (recipe.kind === 'sum' && recipe.operands.some(operandMissing)) return 'Choose every field or value required by this calculation.'
  if ((recipe.kind === 'difference' || recipe.kind === 'product' || recipe.kind === 'division') && (operandMissing(recipe.left) || operandMissing(recipe.right))) return 'Choose every field or value required by this calculation.'
  if (recipe.kind === 'division' && recipe.right.kind === 'value' && recipe.right.valueType === 'number' && Number(recipe.right.value) === 0) return 'The divisor cannot be zero.'
  if (recipe.kind === 'percentage' && operandMissing(recipe.base)) return 'Choose every field or value required by this calculation.'
  if (recipe.kind === 'conditional' && [recipe.source, recipe.comparison, recipe.whenTrue, recipe.whenFalse].some(operandMissing)) return 'Choose every field or value required by this calculation.'
  if (recipe.kind === 'date_difference' && (!recipe.startFieldId || !recipe.endFieldId)) return 'Choose both date fields.'
  if (recipe.kind === 'date_add' && !recipe.dateFieldId) return 'Choose a date field.'
  return null
}
