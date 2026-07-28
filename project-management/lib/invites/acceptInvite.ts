import { tasklyticApiJson } from '../tasklyticApi'

export type AcceptInviteResult = {
  workspaceId: string
  role: string
}

/** Accept a workspace invitation by token (requires signed-in user). */
export async function acceptWorkspaceInvite(token: string): Promise<AcceptInviteResult> {
  return tasklyticApiJson<AcceptInviteResult>('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token: token.trim() }),
  })
}
