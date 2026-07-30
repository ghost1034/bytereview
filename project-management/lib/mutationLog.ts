/** Ring buffer of recent store mutations for error diagnostics. */
export type MutationEntry = {
  at: string
  entity: string
  action: 'add' | 'update' | 'remove' | 'bulkSet'
  id?: string
}

const MAX = 50
const buffer: MutationEntry[] = []

/** Record a store mutation (called from createEntityStore). */
export function logMutation(entry: Omit<MutationEntry, 'at'>): void {
  buffer.push({ ...entry, at: new Date().toISOString() })
  if (buffer.length > MAX) buffer.shift()
}

/** Return the last 50 mutations as JSON-serializable array. */
export function getMutationDiagnostics(): MutationEntry[] {
  return [...buffer]
}
