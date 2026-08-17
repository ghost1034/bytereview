/**
 * Reconciliation transaction / match-group / rule shapes.
 *
 * The OpenAPI types for these JSONB columns are intentionally loose
 * (`{[key: string]: unknown}[]`), so the frontend defines the concrete shape
 * once here. These align with the backend's `services/analytics/reconciliations_service.py`
 * and `services/analytics_ai_service.py` JSON schemas.
 */

export type ReconciliationStep = 'upload' | 'rules' | 'results'

export type TransactionStatus = 'unmatched' | 'matched' | 'suggested'

export type MatchGroupType = '1:1' | '1:Many' | 'Many:1' | 'Many:Many'

export type MatchGroupStatus = 'suggested' | 'approved' | 'rejected' | 'matched'

export type ExceptionStatus = 'open' | 'investigating' | 'resolved' | 'waived'

export interface ReconciliationTransaction {
  id: string
  date: string
  description: string
  amount: number
  referenceId?: string
  source: 'A' | 'B'
  status: TransactionStatus
  matchGroupId?: string
  exceptionCategory?: string
  exceptionReasoning?: string
  exceptionStatus?: ExceptionStatus
  exceptionNote?: string
  /** Pass-through columns from the uploaded file. */
  [key: string]: unknown
}

export interface ReconciliationMatchGroup {
  id: string
  type: MatchGroupType
  sourceAIds?: string[]
  sourceBIds?: string[]
  totalA: number
  totalB: number
  confidence: number
  explanation: string
  status: MatchGroupStatus | string
  aiDetails?: {
    matchedEntities?: string[]
    matchedReferences?: string[]
    suggestedLabel?: string
  }
}

export interface ReconciliationRule {
  id?: string
  type: string
  config?: Record<string, unknown>
}

export interface ReconciliationPass {
  id?: string
  name: string
  matchTypes: MatchGroupType[]
  rules: ReconciliationRule[]
  logic: 'AND' | 'OR'
}

export interface AvailableRuleCategory {
  category: string
  rules: string[]
}

export interface UnmatchedException {
  id: string
  source?: 'A' | 'B'
  exceptionCategory?: string
  exceptionReasoning?: string
}

/** Column keys that should never become rule sources. */
const RULE_KEY_BLOCKLIST = new Set([
  'id',
  'source',
  'status',
  'matchgroupid',
  'exceptioncategory',
  'exceptionreasoning',
  'source file path(s)',
])

const normalizeKey = (key: string) => key.trim().toLowerCase()

const RULE_CATEGORY_LABELS: Record<string, string> = {
  referenceid: 'Reference ID',
}

/**
 * Inspect a sample of transactions and build the rule library that the
 * LLM endpoints expect. Ported from CPAAnalytics' `availableRules` useMemo.
 */
export function buildAvailableRules(
  sourceA: ReconciliationTransaction[],
  sourceB: ReconciliationTransaction[],
): AvailableRuleCategory[] {
  const keyTypes = new Map<
    string,
    { key: string; type: 'amount' | 'date' | 'text' }
  >()
  const sampleSize = Math.min(100, sourceA.length + sourceB.length)
  const combined = [...sourceA, ...sourceB].slice(0, sampleSize)

  for (const txn of combined) {
    for (const key of Object.keys(txn)) {
      const normalizedKey = normalizeKey(key)
      if (key.startsWith('_') || RULE_KEY_BLOCKLIST.has(normalizedKey)) continue
      if (keyTypes.has(normalizedKey)) continue
      const value = (txn as Record<string, unknown>)[key]
      const lower = normalizedKey
      if (typeof value === 'number') {
        keyTypes.set(normalizedKey, { key, type: 'amount' })
      } else if (lower.includes('date')) {
        keyTypes.set(normalizedKey, { key, type: 'date' })
      } else if (lower.includes('amount') || lower.includes('balance')) {
        keyTypes.set(normalizedKey, { key, type: 'amount' })
      } else {
        keyTypes.set(normalizedKey, { key, type: 'text' })
      }
    }
  }

  const titleCase = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)
  const out: AvailableRuleCategory[] = []
  const seenCategories = new Set<string>()

  for (const [normalizedKey, { key, type }] of keyTypes.entries()) {
    const display = RULE_CATEGORY_LABELS[normalizedKey] ?? titleCase(key)
    const normalizedDisplay = normalizeKey(display)
    if (seenCategories.has(normalizedDisplay)) continue
    seenCategories.add(normalizedDisplay)
    if (type === 'amount') {
      out.push({
        category: display,
        rules: [
          `${display} - Exact Match`,
          `${display} - Tolerance (Absolute)`,
          `${display} - Tolerance (Percentage)`,
          `${display} - Sum Match`,
          `${display} - Sum Match Tolerance (Absolute)`,
          `${display} - Sum Match Tolerance (Percentage)`,
        ],
      })
    } else if (type === 'date') {
      out.push({
        category: display,
        rules: [
          `${display} - Exact`,
          `${display} - Range`,
          `${display} - Source A Leads`,
          `${display} - Source B Leads`,
        ],
      })
    } else {
      out.push({
        category: display,
        rules: [
          `${display} - Exact Match`,
          `${display} - Contains`,
          `${display} - Partial/Contains`,
          `${display} - Regex Pattern`,
          `${display} - AI Semantic`,
        ],
      })
    }
  }

  return out
}

/**
 * Normalize an upload-flow row into a `ReconciliationTransaction`. The upload
 * flow returns raw rows keyed by the source's original column names, plus a
 * `_fileRole` ('Source A' | 'Source B') and `_fileName` marker. Caller passes
 * in the `columnMapping` returned by the flow (target field → source column).
 */
export function normalizeUploadedRow(
  row: Record<string, unknown>,
  source: 'A' | 'B',
  mapping: Record<string, string>,
  index: number,
): ReconciliationTransaction {
  const dateCol = mapping['Transaction Date']
  const descCol = mapping['Description']
  const amountCol = mapping['Amount']
  const idCol = mapping['Reference ID'] || mapping['Reference']

  const rawAmount = amountCol ? row[amountCol] : undefined
  const rawReferenceId = idCol ? row[idCol] : undefined
  const referenceId =
    rawReferenceId == null || String(rawReferenceId).trim() === ''
      ? undefined
      : String(rawReferenceId)
  const amount =
    typeof rawAmount === 'number'
      ? rawAmount
      : parseFloat(String(rawAmount ?? '').replace(/[^0-9.\-]/g, '')) || 0

  const txn: ReconciliationTransaction = {
    id: referenceId ?? `${source.toLowerCase()}-${index + 1}`,
    date: dateCol ? String(row[dateCol] ?? '') : '',
    description: descCol ? String(row[descCol] ?? '') : '',
    amount,
    ...(referenceId ? { referenceId } : {}),
    source,
    status: 'unmatched',
  }

  // Carry through other columns verbatim so they're available to the rule
  // builder + LLM matcher. Don't duplicate mapped columns or metadata.
  const mappedSourceKeys = new Set(
    [dateCol, descCol, amountCol, idCol]
      .filter((key): key is string => Boolean(key))
      .map(normalizeKey),
  )
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(key)
    if (mappedSourceKeys.has(normalizedKey)) continue
    if (RULE_KEY_BLOCKLIST.has(normalizedKey)) continue
    if (key.startsWith('_')) continue
    if (key in txn) continue
    ;(txn as Record<string, unknown>)[key] = value
  }

  return txn
}

/** Counts useful for the active-editor AIContext summary. */
export function summarizeRecord(record: {
  source_a?: unknown[] | null
  source_b?: unknown[] | null
  match_groups?: unknown[] | null
}): {
  matchedGroups: number
  approvedGroups: number
  rejectedGroups: number
  unmatchedA: number
  unmatchedB: number
} {
  const groups = (record.match_groups ?? []) as ReconciliationMatchGroup[]
  const sourceA = (record.source_a ?? []) as ReconciliationTransaction[]
  const sourceB = (record.source_b ?? []) as ReconciliationTransaction[]
  return {
    matchedGroups: groups.length,
    approvedGroups: groups.filter((g) => g.status === 'approved').length,
    rejectedGroups: groups.filter((g) => g.status === 'rejected').length,
    unmatchedA: sourceA.filter((t) => t.status === 'unmatched').length,
    unmatchedB: sourceB.filter((t) => t.status === 'unmatched').length,
  }
}

/** Derive the workflow step from the loaded record. */
export function deriveStep(record: {
  source_a?: unknown[] | null
  match_groups?: unknown[] | null
}): ReconciliationStep {
  if (!record.source_a || record.source_a.length === 0) return 'upload'
  if (!record.match_groups || record.match_groups.length === 0) return 'rules'
  return 'results'
}
