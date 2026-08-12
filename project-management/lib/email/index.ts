import { localEmailAdapter } from './localAdapter'
import { serverEmailAdapter } from './serverAdapter'
import { usesTasklyticBackend } from '../runtimeMode'
import type { EmailAdapter } from './types'

/** Customer email is server-backed; local queues are test/evaluation-only. */
export function getEmailAdapter(): EmailAdapter {
  return usesTasklyticBackend()
    ? serverEmailAdapter
    : localEmailAdapter
}

export type { EmailAdapter, EmailSendInput, PendingEmail } from './types'
