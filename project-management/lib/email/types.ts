import type { ID, ISODateTime, PendingEmail } from '../../types'

export type { PendingEmail }

export type EmailSendInput = {
  to: string | string[]
  subject: string
  bodyHtml: string
  bodyText?: string
  workspaceId?: ID
  category?: PendingEmail['category']
  metadata?: Record<string, unknown>
}

/** Swappable email delivery seam — V1 queues pending emails in the repository. */
export interface EmailAdapter {
  send(input: EmailSendInput): Promise<{ ids: ID[] }>
  listPending(workspaceId?: ID): Promise<PendingEmail[]>
  markSent(id: ID): Promise<void>
  readonly capabilities: {
    deliversExternally: boolean
    provider: 'local' | 'gmail' | 'ses' | 'sendgrid' | 'postmark' | 'resend'
  }
}
