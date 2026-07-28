/**
 * Safe formula evaluator for custom formula fields (no eval).
 * Supports + - * /, parentheses, [Field Name] refs, IF(cond,a,b), and SUM(a,b,...).
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }
  | { kind: 'ident'; value: 'IF' | 'SUM' }

export type FormulaResult = { ok: true; value: number | null } | { ok: false; error: string }

function tokenize(input: string): Token[] | { error: string } {
  const tokens: Token[] = []
  let i = 0
  const s = input.trim()
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i += 1
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' })
      i += 1
      continue
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch as '+' | '-' | '*' | '/' })
      i += 1
      continue
    }
    if (ch === '[') {
      const end = s.indexOf(']', i)
      if (end < 0) return { error: 'Unclosed field reference' }
      tokens.push({ kind: 'ref', name: s.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1
      tokens.push({ kind: 'num', value: Number(s.slice(i, j)) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j += 1
      const word = s.slice(i, j).toUpperCase()
      if (word === 'IF' || word === 'SUM') tokens.push({ kind: 'ident', value: word })
      else return { error: `Unknown identifier: ${s.slice(i, j)}` }
      i = j
      continue
    }
    return { error: `Unexpected character: ${ch}` }
  }
  return tokens
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[], private resolveRef: (name: string) => number) {}

  parse(): FormulaResult {
    if (!this.tokens.length) return { ok: true, value: null }
    const v = this.parseExpr()
    if (this.pos < this.tokens.length) return { ok: false, error: 'Unexpected trailing tokens' }
    return { ok: true, value: v }
  }

  private parseExpr(): number {
    let v = this.parseTerm()
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos]
      if (t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) break
      this.pos += 1
      const rhs = this.parseTerm()
      v = t.value === '+' ? v + rhs : v - rhs
    }
    return v
  }

  private parseTerm(): number {
    let v = this.parseFactor()
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos]
      if (t.kind !== 'op' || (t.value !== '*' && t.value !== '/')) break
      this.pos += 1
      const rhs = this.parseFactor()
      v = t.value === '*' ? v * rhs : rhs === 0 ? 0 : v / rhs
    }
    return v
  }

  private parseFactor(): number {
    const t = this.tokens[this.pos]
    if (!t) return 0
    if (t.kind === 'num') {
      this.pos += 1
      return t.value
    }
    if (t.kind === 'ref') {
      this.pos += 1
      return this.resolveRef(t.name)
    }
    if (t.kind === 'ident' && t.value === 'IF') {
      this.pos += 1
      this.expect('lparen')
      const cond = this.parseExpr()
      this.expect('comma')
      const a = this.parseExpr()
      this.expect('comma')
      const b = this.parseExpr()
      this.expect('rparen')
      return cond !== 0 ? a : b
    }
    if (t.kind === 'ident' && t.value === 'SUM') {
      this.pos += 1
      this.expect('lparen')
      let total = 0
      total += this.parseExpr()
      while (this.peekComma()) {
        this.pos += 1
        total += this.parseExpr()
      }
      this.expect('rparen')
      return total
    }
    if (t.kind === 'lparen') {
      this.pos += 1
      const v = this.parseExpr()
      this.expect('rparen')
      return v
    }
    return 0
  }

  private peekComma(): boolean {
    return this.tokens[this.pos]?.kind === 'comma'
  }

  private expect(kind: Token['kind']): void {
    const t = this.tokens[this.pos]
    if (!t || t.kind !== kind) return
    this.pos += 1
  }
}

/** Evaluate a formula expression using a field-name resolver. */
export function evaluateFormula(
  expression: string,
  resolveRef: (name: string) => number
): FormulaResult {
  const trimmed = expression.trim()
  if (!trimmed) return { ok: true, value: null }
  const tokens = tokenize(trimmed)
  if ('error' in tokens) return { ok: false, error: tokens.error }
  return new Parser(tokens, resolveRef).parse()
}
