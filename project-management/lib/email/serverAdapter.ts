import { tasklyticApiJson } from '../tasklyticApi'
import type { PendingEmail } from '../../types'
import type { EmailAdapter, EmailSendInput } from './types'

/** Gmail-backed delivery through the authenticated Tasklytic API. */
export const serverEmailAdapter: EmailAdapter = {
  capabilities: { deliversExternally: true, provider: 'gmail' },

  async send(input: EmailSendInput) {
    if (!input.workspaceId) throw new Error('Server email delivery requires a workspace')
    return tasklyticApiJson<{ ids: string[] }>('/email/send', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async listPending(): Promise<PendingEmail[]> {
    return []
  },

  async markSent(): Promise<void> {
    // Server delivery is synchronous; backend mode has no browser queue.
  },
}
