/**

 * Workspace invite helpers — persist invitations and deliver email (server Gmail or local queue).

 */

import { usesTasklyticBackend } from './forms/publicFormApi'

import { getEmailAdapter } from './email'

import { newId } from './ids'

import { now } from './time'

import { tasklyticApiJson } from './tasklyticApi'

import type { WorkspaceInvitation } from '../types'

import { useWorkspaceInvitationsStore } from '../stores/entities'



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/



export function parseInviteEmails(raw: string): string[] {

  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]

}



export function isValidInviteEmail(email: string): boolean {

  return EMAIL_RE.test(email)

}



type InviteInput = {

  workspaceId: string

  workspaceName: string

  emails: string[]

  role: WorkspaceInvitation['role']

  invitedById: string

  invitedByName: string

  note?: string

  teamId?: string

}



export type InviteResult = {

  email: string

  ok: boolean

  error?: string

  /** True when the server delivered email via Gmail (backend mode only). */

  emailSent?: boolean

}



type ServerInviteRow = InviteResult & { invitation?: WorkspaceInvitation }



async function sendWorkspaceInvitesViaBackend(input: InviteInput): Promise<InviteResult[]> {

  const res = await tasklyticApiJson<{ results: ServerInviteRow[] }>('/invitations/send', {

    method: 'POST',

    body: JSON.stringify({

      workspaceId: input.workspaceId,

      workspaceName: input.workspaceName,

      emails: input.emails,

      role: input.role,

      note: input.note,

      teamId: input.teamId,

      invitedByName: input.invitedByName,

    }),

  })



  const store = useWorkspaceInvitationsStore.getState()

  for (const row of res.results) {

    if (row.invitation) {

      const existing = store.getById(row.invitation.id)

      if (existing) {

        await store.update(row.invitation.id, row.invitation)

      } else {

        await store.add(row.invitation)

      }

    }

  }



  return res.results.map(({ email, ok, error, emailSent }) => ({

    email,

    ok,

    error,

    emailSent,

  }))

}



async function sendWorkspaceInvitesLocally(input: InviteInput): Promise<InviteResult[]> {

  const emailAdapter = getEmailAdapter()

  const invitationStore = useWorkspaceInvitationsStore.getState()

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const results: InviteResult[] = []



  for (const email of input.emails) {

    if (!isValidInviteEmail(email)) {

      results.push({ email, ok: false, error: 'Invalid email address' })

      continue

    }



    try {

      const token = newId()

      const invitation: WorkspaceInvitation = {

        id: newId(),

        workspaceId: input.workspaceId,

        email,

        role: input.role,

        invitedById: input.invitedById,

        teamId: input.teamId,

        note: input.note?.trim() || undefined,

        status: 'pending',

        token,

        expiresAt,

        createdAt: now(),

      }

      await invitationStore.add(invitation)



      const noteBlock = input.note?.trim()

        ? `<p><strong>Personal note:</strong> ${input.note.trim()}</p>`

        : ''

      await emailAdapter.send({

        to: email,

        workspaceId: input.workspaceId,

        category: 'invite',

        subject: `${input.invitedByName} invited you to ${input.workspaceName} on Tasklytic`,

        bodyHtml: `

          <p>${input.invitedByName} invited you to join <strong>${input.workspaceName}</strong> as ${input.role}.</p>

          ${noteBlock}

          <p><a href="/dashboard/tasklytic/accept-invite?token=${encodeURIComponent(token)}">Accept invitation</a></p>

        `.trim(),

        bodyText: `${input.invitedByName} invited you to ${input.workspaceName}. Accept: /dashboard/tasklytic/accept-invite?token=${token}`,

        metadata: { invitationId: invitation.id, role: input.role },

      })

      results.push({ email, ok: true, emailSent: false })

    } catch (error) {

      results.push({

        email,

        ok: false,

        error: error instanceof Error ? error.message : 'Failed to send invite',

      })

    }

  }



  return results

}



/** Create invitation records and send or queue invite emails. */

export async function sendWorkspaceInvites(input: InviteInput): Promise<InviteResult[]> {

  if (usesTasklyticBackend()) {

    return sendWorkspaceInvitesViaBackend(input)

  }

  return sendWorkspaceInvitesLocally(input)

}

