export type ReassignmentMode = 'none' | 'all' | 'selected'

interface ReassignmentRecipient {
  role: string
  allowReassignment: boolean
}

const INELIGIBLE_REASSIGNMENT_ROLES = new Set(['cc', 'witness', 'in_person_signer'])

export function canRecipientReassign(role: string): boolean {
  return !INELIGIBLE_REASSIGNMENT_ROLES.has(role)
}

export function reassignmentModeFor(
  envelopeAllowsReassignment: boolean,
  recipients: ReassignmentRecipient[],
): ReassignmentMode {
  if (!envelopeAllowsReassignment) return 'none'
  const eligibleRecipients = recipients.filter((recipient) => canRecipientReassign(recipient.role))
  if (eligibleRecipients.length > 0 && eligibleRecipients.every((recipient) => recipient.allowReassignment)) return 'all'
  return 'selected'
}

export function allowReassignmentForAll<T extends ReassignmentRecipient>(recipients: T[]): T[] {
  return recipients.map((recipient) => ({
    ...recipient,
    allowReassignment: canRecipientReassign(recipient.role),
  }))
}
