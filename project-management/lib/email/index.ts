import { localEmailAdapter } from './localAdapter'
import { serverEmailAdapter } from './serverAdapter'
import type { EmailAdapter } from './types'

/** Returns the configured email adapter (V1: local pending queue). */
export function getEmailAdapter(): EmailAdapter {
  return process.env.NEXT_PUBLIC_TASKLYTIC_BACKEND === '1'
    ? serverEmailAdapter
    : localEmailAdapter
}

export type { EmailAdapter, EmailSendInput, PendingEmail } from './types'
