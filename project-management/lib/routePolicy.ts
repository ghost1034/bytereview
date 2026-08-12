export const PROJECT_MANAGEMENT_ROUTE = '/dashboard/project-management'
export const PUBLIC_PROJECT_MANAGEMENT_FORM_ROUTE = '/project-management/forms'

const REMOVED_CUSTOMER_PATH_SEGMENTS = new Set([
  'trial',
  'try',
  'guest',
  'signup',
  'sign-up',
])

export function isCustomerProjectManagementRoute(pathname: string): boolean {
  return pathname === PROJECT_MANAGEMENT_ROUTE || pathname.startsWith(`${PROJECT_MANAGEMENT_ROUTE}/`)
}

export function isPublicProjectManagementFormRoute(pathname: string): boolean {
  return pathname.startsWith(`${PUBLIC_PROJECT_MANAGEMENT_FORM_ROUTE}/`)
}

export function isRemovedCustomerTrialRoute(segments: readonly string[]): boolean {
  return segments.some((segment) => REMOVED_CUSTOMER_PATH_SEGMENTS.has(segment.toLowerCase()))
}

export function canAccessInternalEvaluationRoute(
  segments: readonly string[],
  internalEvaluationEnabled: boolean,
): boolean {
  return segments[0] === 'internal' && segments[1] === 'eval' && internalEvaluationEnabled
}
