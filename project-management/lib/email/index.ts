import { localEmailAdapter } from './localAdapter'
import type { EmailAdapter } from './types'

/** Returns the configured email adapter (V1: local pending queue). */
export function getEmailAdapter(): EmailAdapter {
  return localEmailAdapter
}

export type { EmailAdapter, EmailSendInput, PendingEmail } from './types'
