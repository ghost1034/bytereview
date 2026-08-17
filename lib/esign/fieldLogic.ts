export type EsignFieldType =
  | 'signature' | 'initials' | 'date_signed' | 'text' | 'checkbox' | 'auto_fill'
  | 'attachment' | 'radio' | 'dropdown' | 'formula' | 'stamp' | 'date' | 'number'
  | 'first_name' | 'last_name' | 'full_name' | 'email' | 'company' | 'title' | 'note'

export interface LogicField {
  id: string
  label?: string | null
  recipient_id?: string
  recipient_index?: number
  field_type: EsignFieldType
  required?: boolean
  properties?: {
    group?: { id?: string | null } | null
    selection_group?: { id: string; label?: string; minimum_selected?: number; maximum_selected?: number | null; validation_message?: string | null } | null
    option_value?: string | null
    formula?: { expression?: string | null; decimal_places?: number | null } | null
    conditional?: ConditionalRule | null
    data_label?: string | null
    shared_value?: boolean | null
    read_only?: boolean | null
    text_validation?: { max_length?: number | null; regex?: string | null; message?: string | null } | null
    number_validation?: { minimum?: number | null; maximum?: number | null; decimal_places?: number | null; allow_negative?: boolean | null } | null
    date_validation?: { minimum?: string | null; maximum?: string | null } | null
    options?: Array<{ value: string; label?: string }> | null
    [key: string]: unknown
  } | null
}

export interface ConditionalRule {
  parent_field_id: string
  operator: 'equals' | 'not_equals' | 'any_of' | 'checked' | 'unchecked' | 'not_empty'
  values?: string[]
  action?: 'show' | 'require'
}

const REF = /\[([^\[\]]+)\]/g

type FormulaValue = number | string | boolean | Date

export interface FormulaEvaluationResult {
  value?: string
  error?: string
}

function roundHalfAwayFromZero(value: number, places: number): number {
  const factor = 10 ** places
  const magnitude = Math.abs(value) * factor
  // Offset only enough to neutralize common binary representation error at a
  // decimal tie; this implements Python Decimal ROUND_HALF_UP semantics.
  const rounded = Math.round(magnitude + Number.EPSILON * Math.max(1, magnitude)) / factor
  return value < 0 ? -rounded : rounded
}

function decimalResult(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Numeric result is not finite')
  // Formula inputs are decimal strings. Normalizing each operation to 15
  // significant digits removes binary IEEE-754 residue (for example
  // 0.1 + 0.2) so comparisons match the server's Decimal evaluator.
  return Number(value.toPrecision(15))
}

class FormulaParser {
  private pos = 0
  constructor(
    private readonly source: string,
    private readonly values: Record<string, unknown>,
    private readonly validateOnly = false,
  ) {}

  parse(): FormulaValue {
    const value = this.comparison()
    this.space()
    if (this.pos !== this.source.length) throw new Error(`Unexpected token at ${this.pos + 1}`)
    return value
  }
  private space() { while (/\s/.test(this.source[this.pos] ?? '')) this.pos += 1 }
  private take(value: string) {
    if (this.source.startsWith(value, this.pos)) { this.pos += value.length; return true }
    return false
  }
  private comparison(): FormulaValue {
    const value = this.expression()
    this.space()
    for (const operator of ['>=', '<=', '!=', '==', '>', '<']) {
      if (!this.take(operator)) continue
      const right = this.expression()
      const comparableLeft = typeof value === 'number' ? decimalResult(value) : value
      const comparableRight = typeof right === 'number' ? decimalResult(right) : right
      if (operator === '==') return comparableLeft === comparableRight
      if (operator === '!=') return comparableLeft !== comparableRight
      if (operator === '>') return comparableLeft > comparableRight
      if (operator === '<') return comparableLeft < comparableRight
      if (operator === '>=') return comparableLeft >= comparableRight
      return comparableLeft <= comparableRight
    }
    return value
  }
  private numeric(value: FormulaValue): number {
    if (this.validateOnly) return 1
    const result = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, '').trim())
    if (!Number.isFinite(result)) throw new Error('Value is not numeric')
    return result
  }
  private expression(): FormulaValue {
    let value = this.term()
    for (;;) {
      this.space()
      if (this.take('+')) value = decimalResult(this.numeric(value) + this.numeric(this.term()))
      else if (this.take('-')) value = decimalResult(this.numeric(value) - this.numeric(this.term()))
      else return value
    }
  }
  private term(): FormulaValue {
    let value = this.factor()
    for (;;) {
      this.space()
      if (this.take('*')) value = decimalResult(this.numeric(value) * this.numeric(this.factor()))
      else if (this.take('/')) {
        const divisor = this.numeric(this.factor())
        if (divisor === 0) throw new Error('Division by zero')
        value = decimalResult(this.numeric(value) / divisor)
      } else return value
    }
  }
  private factor(): FormulaValue {
    this.space()
    if (this.take('+')) return this.numeric(this.factor())
    if (this.take('-')) return -this.numeric(this.factor())
    if (this.take('(')) {
      const value = this.comparison(); this.space()
      if (!this.take(')')) throw new Error('Missing closing parenthesis')
      return value
    }
    if (this.take('[')) {
      const end = this.source.indexOf(']', this.pos)
      if (end < 0) throw new Error('Unclosed field reference')
      const id = this.source.slice(this.pos, end)
      this.pos = end + 1
      const raw = this.values[id]
      if (raw === null || raw === undefined || String(raw).trim() === '') throw new Error('Unresolved field')
      const numeric = Number(String(raw).replace(/[$,]/g, '').trim())
      return Number.isFinite(numeric) ? numeric : String(raw)
    }
    const quote = this.source[this.pos]
    if (quote === '"' || quote === "'") {
      this.pos += 1
      let value = ''
      while (this.pos < this.source.length) {
        const char = this.source[this.pos]
        if (char === quote) { this.pos += 1; return value }
        if (char === '\\' && this.pos + 1 < this.source.length) {
          value += this.source[this.pos + 1]; this.pos += 2; continue
        }
        value += char; this.pos += 1
      }
      throw new Error('Unclosed text value')
    }
    const fn = /^([A-Za-z][A-Za-z0-9_]*)\s*\(/.exec(this.source.slice(this.pos))
    if (fn) {
      this.pos += fn[0].length
      if (fn[1].toUpperCase() === 'IF') {
        const sources = this.readCallArguments()
        if (sources.length !== 3) throw new Error('IF requires three arguments')
        if (this.validateOnly) {
          sources.forEach((source) => new FormulaParser(source, this.values, true).parse())
          return 1
        }
        const condition = new FormulaParser(sources[0], this.values).parse()
        return new FormulaParser(condition ? sources[1] : sources[2], this.values).parse()
      }
      const args: FormulaValue[] = []
      this.space()
      if (!this.take(')')) {
        for (;;) {
          args.push(this.comparison()); this.space()
          if (this.take(')')) break
          if (!this.take(',')) throw new Error('Expected comma')
        }
      }
      return this.call(fn[1].toUpperCase(), args)
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(this.source.slice(this.pos))
    if (!match) throw new Error(`Expected a value at ${this.pos + 1}`)
    this.pos += match[0].length
    return Number(match[0])
  }
  private readCallArguments(): string[] {
    const args: string[] = []
    let start = this.pos, depth = 0, quote = ''
    for (; this.pos < this.source.length; this.pos += 1) {
      const char = this.source[this.pos]
      if (quote) { if (char === quote && this.source[this.pos - 1] !== '\\') quote = ''; continue }
      if (char === '"' || char === "'") { quote = char; continue }
      if (char === '(') { depth += 1; continue }
      if (char === ')') {
        if (depth > 0) { depth -= 1; continue }
        args.push(this.source.slice(start, this.pos).trim()); this.pos += 1; return args
      }
      if (char === ',' && depth === 0) { args.push(this.source.slice(start, this.pos).trim()); start = this.pos + 1 }
    }
    throw new Error('Unclosed function call')
  }
  private call(name: string, args: FormulaValue[]): FormulaValue {
    if (this.validateOnly) {
      const valid = name === 'ROUND' && args.length >= 1 && args.length <= 2
        || ['MIN', 'MAX'].includes(name) && args.length > 0
        || name === 'SUM' && args.length > 0
        || ['FLOOR', 'CEILING'].includes(name) && args.length === 1
        || ['DATEADD', 'DATEDIFF'].includes(name) && (args.length === 2 || args.length === 3)
      if (valid) return 1
      throw new Error(`Unsupported function ${name}`)
    }
    const numbers = () => args.map((value) => this.numeric(value))
    const dateValue = (value: FormulaValue) => value instanceof Date ? new Date(value.valueOf()) : new Date(`${String(value)}T00:00:00Z`)
    if (name === 'IF' && args.length === 3) return args[0] ? args[1] : args[2]
    if (name === 'ROUND' && args.length >= 1 && args.length <= 2) {
      const places = args.length === 2 ? this.numeric(args[1]) : 0
      return roundHalfAwayFromZero(this.numeric(args[0]), places)
    }
    if (name === 'MIN' && args.length) return Math.min(...numbers())
    if (name === 'MAX' && args.length) return Math.max(...numbers())
    if (name === 'SUM' && args.length) return numbers().reduce((total, value) => decimalResult(total + value), 0)
    if (name === 'FLOOR' && args.length === 1) return Math.floor(this.numeric(args[0]))
    if (name === 'CEILING' && args.length === 1) return Math.ceil(this.numeric(args[0]))
    if (name === 'DATEADD' && (args.length === 2 || args.length === 3)) {
      if (args[2] && !['day', 'days'].includes(String(args[2]).toLowerCase())) throw new Error('Unsupported date unit')
      const result = dateValue(args[0])
      if (Number.isNaN(result.valueOf())) throw new Error('Invalid date')
      result.setUTCDate(result.getUTCDate() + this.numeric(args[1])); return result
    }
    if (name === 'DATEDIFF' && (args.length === 2 || args.length === 3)) {
      if (args[2] && !['day', 'days'].includes(String(args[2]).toLowerCase())) throw new Error('Unsupported date unit')
      const start = dateValue(args[0]), end = dateValue(args[1])
      if ([start, end].some((value) => Number.isNaN(value.valueOf()))) throw new Error('Invalid date')
      return Math.round((end.valueOf() - start.valueOf()) / 86_400_000)
    }
    throw new Error(`Unsupported function ${name}`)
  }
}

export function formulaReferences(expression: string): string[] {
  return [...(expression ?? '').matchAll(REF)].map((match) => match[1])
}

export function validateFormula(expression: string): string[] {
  const refs = formulaReferences(expression)
  new FormulaParser(expression, Object.fromEntries(refs.map((id) => [id, 1])), true).parse()
  return refs
}

export function evaluateFormula(
  expression: string,
  values: Record<string, unknown>,
  decimalPlaces = 2,
): string {
  return evaluateFormulaDiagnostic(expression, values, decimalPlaces).value ?? ''
}

export function evaluateFormulaDiagnostic(
  expression: string,
  values: Record<string, unknown>,
  decimalPlaces = 2,
): FormulaEvaluationResult {
  try {
    const result = new FormulaParser(expression, values).parse()
    if (result instanceof Date) return { value: result.toISOString().slice(0, 10) }
    if (typeof result === 'boolean') return { value: result ? 'true' : 'false' }
    if (typeof result === 'number' && Number.isFinite(result)) {
      const places = Math.max(0, Math.min(10, decimalPlaces))
      return { value: roundHalfAwayFromZero(result, places).toFixed(places) }
    }
    return { value: String(result) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Formula could not be evaluated' }
  }
}

function radioValue(parent: LogicField, fields: LogicField[], values: Record<string, string>): string {
  const groupId = parent.properties?.group?.id
  const member = fields.find(
    (field) => field.field_type === 'radio' && field.properties?.group?.id === groupId && values[field.id] === 'true',
  )
  return member?.properties?.option_value ?? ''
}

export function conditionMatches(
  rule: ConditionalRule,
  parent: LogicField,
  fields: LogicField[],
  values: Record<string, string>,
): boolean {
  const current = parent.field_type === 'radio' ? radioValue(parent, fields, values) : (values[parent.id] ?? '')
  const expected = (rule.values ?? []).map(String)
  if (rule.operator === 'equals') return expected.length > 0 && current === expected[0]
  if (rule.operator === 'not_equals') return expected.length > 0 && current !== expected[0]
  if (rule.operator === 'any_of') return expected.includes(current)
  if (rule.operator === 'checked') return current === 'true'
  if (rule.operator === 'unchecked') return current !== 'true'
  if (rule.operator === 'not_empty') return current.trim().length > 0
  return false
}

export function resolveVisibility(fields: LogicField[], values: Record<string, string>): Record<string, boolean> {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const visible = Object.fromEntries(fields.map((field) => [field.id, true])) as Record<string, boolean>
  for (let pass = 0; pass <= fields.length; pass += 1) {
    let changed = false
    for (const field of fields) {
      const rule = field.properties?.conditional
      if (!rule || (rule.action ?? 'show') !== 'show') continue
      const parent = byId.get(rule.parent_field_id)
      const next = !!parent && visible[parent.id] && conditionMatches(rule, parent, fields, values)
      if (visible[field.id] !== next) { visible[field.id] = next; changed = true }
    }
    if (!changed) break
  }
  return visible
}

export function isFieldRequired(
  field: LogicField,
  fields: LogicField[],
  values: Record<string, string>,
  visible = resolveVisibility(fields, values),
): boolean {
  if (!visible[field.id]) return false
  const rule = field.properties?.conditional
  if (rule?.action === 'require') {
    const parent = fields.find((candidate) => candidate.id === rule.parent_field_id)
    return !!parent && visible[parent.id] && conditionMatches(rule, parent, fields, values)
  }
  return !!field.required
}

export function computeFormulas(fields: LogicField[], values: Record<string, string>): Record<string, string> {
  const resolved = { ...values }
  const owner = (field: LogicField) => field.recipient_id ?? String(field.recipient_index ?? '')
  const labelsByOwner = new Map<string, Map<string, string>>()
  for (const field of fields) if (field.properties?.data_label) {
    const labels = labelsByOwner.get(owner(field)) ?? new Map<string, string>()
    labels.set(field.properties.data_label, field.id); labelsByOwner.set(owner(field), labels)
  }
  const pending = new Map(fields.filter((f) => f.field_type === 'formula').map((f) => [f.id, f]))
  for (let pass = 0; pass <= pending.size; pass += 1) {
    let progressed = false
    for (const [id, field] of [...pending]) {
      const formula = field.properties?.formula
      const refs = formulaReferences(formula?.expression ?? '')
      const labels = labelsByOwner.get(owner(field)) ?? new Map<string, string>()
      if (refs.some((ref) => pending.has(labels.get(ref) ?? ref))) continue
      const formulaValues = { ...resolved }
      for (const [label, referencedId] of labels) formulaValues[label] = resolved[referencedId] ?? ''
      resolved[id] = evaluateFormula(formula?.expression ?? '', formulaValues, formula?.decimal_places ?? 2)
      pending.delete(id); progressed = true
    }
    if (!progressed) break
  }
  return Object.fromEntries(fields.filter((f) => f.field_type === 'formula').map((f) => [f.id, resolved[f.id] ?? '']))
}

export function incompleteFields(
  fields: LogicField[],
  values: Record<string, string>,
  signatureAdopted: boolean,
): LogicField[] {
  const visible = resolveVisibility(fields, values)
  const seenRadioGroups = new Set<string>()
  const seenCheckboxGroups = new Set<string>()
  return fields.filter((field) => {
    if (!visible[field.id]) return false
    if (['signature', 'initials', 'stamp'].includes(field.field_type)) {
      return isFieldRequired(field, fields, values, visible) && (!signatureAdopted || values[field.id] !== 'true')
    }
    if (field.field_type === 'date_signed' || field.field_type === 'formula') return false
    if (field.field_type === 'radio') {
      const group = field.properties?.group?.id ?? field.id
      if (seenRadioGroups.has(group)) return false
      seenRadioGroups.add(group)
      const members = fields.filter((item) => item.field_type === 'radio' && item.properties?.group?.id === group)
      return members.some((member) => isFieldRequired(member, fields, values, visible)) &&
        !members.some((member) => values[member.id] === 'true')
    }
    if (field.field_type === 'checkbox' && field.properties?.selection_group?.id) {
      const group = field.properties.selection_group
      if (seenCheckboxGroups.has(group.id)) return false
      seenCheckboxGroups.add(group.id)
      const members = fields.filter((item) => item.field_type === 'checkbox' && item.properties?.selection_group?.id === group.id && visible[item.id])
      const selected = members.filter((member) => values[member.id] === 'true').length
      return selected < (group.minimum_selected ?? 0) || (group.maximum_selected != null && selected > group.maximum_selected)
    }
    if (!isFieldRequired(field, fields, values, visible)) return false
    if (field.field_type === 'checkbox') return values[field.id] !== 'true'
    const value = (values[field.id] ?? '').trim()
    return !value || !!fieldValueError(field, value)
  })
}

export function fieldValueError(field: LogicField, value: string): string | null {
  const rules = field.properties?.text_validation
  if (rules?.max_length && value.length > rules.max_length) return `Maximum length is ${rules.max_length}`
  if (rules?.regex) {
    try { if (!new RegExp(`^(?:${rules.regex})$`).test(value)) return rules.message || 'Invalid format' }
    catch { return 'Invalid validation pattern' }
  }
  if (field.field_type === 'dropdown' && value && !field.properties?.options?.some((option) => option.value === value)) return 'Select a listed option'
  if (field.field_type === 'number' && value) {
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return 'Enter a decimal number'
    const numeric = Number(value), numberRules = field.properties?.number_validation
    if (numberRules?.allow_negative === false && numeric < 0) return 'Negative values are not allowed'
    if (numberRules?.minimum != null && numeric < numberRules.minimum) return `Minimum is ${numberRules.minimum}`
    if (numberRules?.maximum != null && numeric > numberRules.maximum) return `Maximum is ${numberRules.maximum}`
    const decimals = value.split('.')[1]?.length ?? 0
    if (numberRules?.decimal_places != null && decimals > numberRules.decimal_places) return `Use at most ${numberRules.decimal_places} decimal places`
  }
  if (field.field_type === 'date' && value) {
    const parsed = Date.parse(`${value}T00:00:00Z`), dateRules = field.properties?.date_validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return 'Enter a valid date'
    if (dateRules?.minimum && parsed < Date.parse(dateRules.minimum)) return `Date must be on or after ${dateRules.minimum}`
    if (dateRules?.maximum && parsed > Date.parse(dateRules.maximum)) return `Date must be on or before ${dateRules.maximum}`
  }
  return null
}

export function validationErrors(
  fields: LogicField[], values: Record<string, string>, signatureAdopted: boolean,
): Record<string, string> {
  return Object.fromEntries(incompleteFields(fields, values, signatureAdopted).map((field) => {
    const valueError = fieldValueError(field, values[field.id] ?? '')
    const groupMessage = field.field_type === 'checkbox'
      ? field.properties?.selection_group?.validation_message
      : null
    return [field.id, valueError || groupMessage || `${field.label || field.field_type.replace(/_/g, ' ')} is required`]
  }))
}
