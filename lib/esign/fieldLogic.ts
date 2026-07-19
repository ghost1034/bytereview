export interface LogicField {
  id: string
  field_type: string
  required?: boolean
  properties?: {
    group?: { id?: string | null } | null
    option_value?: string | null
    formula?: { expression?: string | null; decimal_places?: number | null } | null
    conditional?: ConditionalRule | null
    [key: string]: unknown
  } | null
}

export interface ConditionalRule {
  parent_field_id: string
  operator: 'equals' | 'not_equals' | 'any_of' | 'checked' | 'unchecked' | 'not_empty'
  values?: string[]
  action?: 'show' | 'require'
}

const REF = /\[([0-9a-fA-F-]{36})\]/g

class FormulaParser {
  private pos = 0
  constructor(private readonly source: string, private readonly values: Record<string, unknown>) {}

  parse(): number {
    const value = this.expression()
    this.space()
    if (this.pos !== this.source.length) throw new Error(`Unexpected token at ${this.pos + 1}`)
    return value
  }
  private space() { while (/\s/.test(this.source[this.pos] ?? '')) this.pos += 1 }
  private take(value: string) {
    if (this.source.startsWith(value, this.pos)) { this.pos += value.length; return true }
    return false
  }
  private expression(): number {
    let value = this.term()
    for (;;) {
      this.space()
      if (this.take('+')) value += this.term()
      else if (this.take('-')) value -= this.term()
      else return value
    }
  }
  private term(): number {
    let value = this.factor()
    for (;;) {
      this.space()
      if (this.take('*')) value *= this.factor()
      else if (this.take('/')) {
        const divisor = this.factor()
        if (divisor === 0) throw new Error('Division by zero')
        value /= divisor
      } else return value
    }
  }
  private factor(): number {
    this.space()
    if (this.take('+')) return this.factor()
    if (this.take('-')) return -this.factor()
    if (this.take('(')) {
      const value = this.expression(); this.space()
      if (!this.take(')')) throw new Error('Missing closing parenthesis')
      return value
    }
    if (this.take('[')) {
      const end = this.source.indexOf(']', this.pos)
      if (end < 0) throw new Error('Unclosed field reference')
      const id = this.source.slice(this.pos, end)
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) throw new Error('Invalid field reference')
      this.pos = end + 1
      const raw = this.values[id]
      if (raw === null || raw === undefined || String(raw).trim() === '') throw new Error('Unresolved field')
      const numeric = Number(String(raw).replace(/[$,]/g, '').trim())
      if (!Number.isFinite(numeric)) throw new Error('Referenced field is not numeric')
      return numeric
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(this.source.slice(this.pos))
    if (!match) throw new Error(`Expected a value at ${this.pos + 1}`)
    this.pos += match[0].length
    return Number(match[0])
  }
}

export function formulaReferences(expression: string): string[] {
  return [...(expression ?? '').matchAll(REF)].map((match) => match[1])
}

export function validateFormula(expression: string): string[] {
  const refs = formulaReferences(expression)
  new FormulaParser(expression, Object.fromEntries(refs.map((id) => [id, 1]))).parse()
  return refs
}

export function evaluateFormula(
  expression: string,
  values: Record<string, unknown>,
  decimalPlaces = 2,
): string {
  try {
    const result = new FormulaParser(expression, values).parse()
    return Number.isFinite(result) ? result.toFixed(Math.max(0, Math.min(10, decimalPlaces))) : ''
  } catch {
    return ''
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
  const pending = new Map(fields.filter((f) => f.field_type === 'formula').map((f) => [f.id, f]))
  for (let pass = 0; pass <= pending.size; pass += 1) {
    let progressed = false
    for (const [id, field] of [...pending]) {
      const formula = field.properties?.formula
      const refs = formulaReferences(formula?.expression ?? '')
      if (refs.some((ref) => pending.has(ref))) continue
      resolved[id] = evaluateFormula(formula?.expression ?? '', resolved, formula?.decimal_places ?? 2)
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
  return fields.filter((field) => {
    if (!visible[field.id]) return false
    if (field.field_type === 'signature' || field.field_type === 'initials') return !signatureAdopted
    if (field.field_type === 'date_signed' || field.field_type === 'formula') return false
    if (field.field_type === 'radio') {
      const group = field.properties?.group?.id ?? field.id
      if (seenRadioGroups.has(group)) return false
      seenRadioGroups.add(group)
      const members = fields.filter((item) => item.field_type === 'radio' && item.properties?.group?.id === group)
      return members.some((member) => isFieldRequired(member, fields, values, visible)) &&
        !members.some((member) => values[member.id] === 'true')
    }
    if (!isFieldRequired(field, fields, values, visible)) return false
    if (field.field_type === 'checkbox') return values[field.id] !== 'true'
    return !(values[field.id] ?? '').trim()
  })
}
