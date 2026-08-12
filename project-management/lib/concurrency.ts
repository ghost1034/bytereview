import type { EntityKind, RevisionedRecord } from './repository/types'

export type RevisionConflict = {
  entity: EntityKind
  attempted: RevisionedRecord
  current: RevisionedRecord
}

type ConflictHandler = (conflict: RevisionConflict) => void
let conflictHandler: ConflictHandler | null = null

export function registerConflictHandler(handler: ConflictHandler | null): void {
  conflictHandler = handler
}

export function reportRevisionConflict(conflict: RevisionConflict): void {
  conflictHandler?.(conflict)
}

export class RevisionConflictError extends Error {
  constructor(readonly conflict: RevisionConflict) {
    super('This record changed after you loaded it. Reload the current version before trying again.')
    this.name = 'RevisionConflictError'
  }
}
