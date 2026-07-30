/**
 * V1 email adapter — queues PendingEmail rows via the repository adapter.
 */
import { newId } from '../ids'
import { getRepository } from '../repository'
import { now } from '../time'
import type { PendingEmail } from '../../types'
import type { EmailAdapter, EmailSendInput } from './types'

async function loadPending(): Promise<PendingEmail[]> {
  return getRepository().loadAll<PendingEmail>('pendingEmails')
}

export const localEmailAdapter: EmailAdapter = {
  capabilities: {
    deliversExternally: false,
    provider: 'local',
  },

  async send(input: EmailSendInput) {
    const recipients = Array.isArray(input.to) ? input.to : [input.to]
    const existing = await loadPending()
    const created: PendingEmail[] = recipients.map((to) => ({
      id: newId(),
      workspaceId: input.workspaceId,
      to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      category: input.category ?? 'other',
      metadata: input.metadata,
      createdAt: now(),
    }))
    await getRepository().saveAll('pendingEmails', [...existing, ...created])
    return { ids: created.map((row) => row.id) }
  },

  async listPending(workspaceId) {
    const rows = await loadPending()
    if (!workspaceId) return rows
    return rows.filter((row) => row.workspaceId === workspaceId)
  },

  async markSent(id) {
    const rows = await loadPending()
    await getRepository().saveAll(
      'pendingEmails',
      rows.filter((row) => row.id !== id)
    )
  },
}
