import type { PbcContact, PbcRequestItem } from './types'

export type PbcPublishIssue = {
  requestId: string
  requestNumber: string
  missingFields: string[]
}

export function getInvalidPbcRequestNumbers(detail: unknown): string[] | null {
  if (!detail || typeof detail !== 'object' || !('invalid_requests' in detail)) return null
  const invalidRequests = detail.invalid_requests
  if (!Array.isArray(invalidRequests)) return null
  return invalidRequests.filter((value): value is string => typeof value === 'string')
}

export function getPbcPublishIssues(
  requests: PbcRequestItem[],
  contacts: PbcContact[],
  invalidRequestNumbers: string[],
): PbcPublishIssue[] {
  const invalid = new Set(invalidRequestNumbers)
  const hasCoordinator = contacts.some((contact) => contact.role === 'coordinator')

  return requests
    .filter((request) => invalid.has(request.request_number))
    .map((request) => {
      const missingFields: string[] = []
      if (!request.title.trim()) missingFields.push('title')
      if (!request.owner_user_id) missingFields.push('internal owner')
      if (!request.due_date) missingFields.push('due date')
      if (!hasCoordinator && request.assignments.length === 0) missingFields.push('client recipient')
      return {
        requestId: request.id,
        requestNumber: request.request_number,
        missingFields,
      }
    })
}
