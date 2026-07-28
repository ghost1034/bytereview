import { describe, expect, it } from 'vitest'

import {
  allowReassignmentForAll,
  canRecipientReassign,
  reassignmentModeFor,
} from './reassignment'

const recipients = [
  { role: 'signer', allowReassignment: true },
  { role: 'approver', allowReassignment: false },
  { role: 'cc', allowReassignment: false },
]

describe('reassignment permissions', () => {
  it('presents the two stored permission levels as one user-facing mode', () => {
    expect(reassignmentModeFor(false, recipients)).toBe('none')
    expect(reassignmentModeFor(true, recipients)).toBe('selected')
    expect(reassignmentModeFor(true, allowReassignmentForAll(recipients))).toBe('all')
  })

  it('does not offer reassignment to roles that cannot initiate it', () => {
    expect(canRecipientReassign('signer')).toBe(true)
    expect(canRecipientReassign('cc')).toBe(false)
    expect(canRecipientReassign('witness')).toBe(false)
    expect(canRecipientReassign('in_person_signer')).toBe(false)
  })

  it('enables only eligible recipients in all-recipient mode', () => {
    expect(allowReassignmentForAll(recipients)).toEqual([
      { role: 'signer', allowReassignment: true },
      { role: 'approver', allowReassignment: true },
      { role: 'cc', allowReassignment: false },
    ])
  })
})
