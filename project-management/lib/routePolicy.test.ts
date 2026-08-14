import { describe, expect, it } from 'vitest'

import {
  PROJECT_MANAGEMENT_ROUTE,
  PUBLIC_PROJECT_MANAGEMENT_FORM_ROUTE,
  canAccessInternalEvaluationRoute,
  isCustomerProjectManagementRoute,
  isPublicProjectManagementFormRoute,
  isRemovedCustomerTrialRoute,
} from './routePolicy'

describe('Tasklytic route boundaries', () => {
  it('recognizes only the canonical authenticated route family', () => {
    expect(PROJECT_MANAGEMENT_ROUTE).toBe('/dashboard/project-management')
    expect(isCustomerProjectManagementRoute(PROJECT_MANAGEMENT_ROUTE)).toBe(true)
    expect(isCustomerProjectManagementRoute(`${PROJECT_MANAGEMENT_ROUTE}/w/w1/home`)).toBe(true)
    expect(isCustomerProjectManagementRoute('/dashboard/tasklytic')).toBe(false)
  })

  it('keeps only published forms in the public route family', () => {
    expect(PUBLIC_PROJECT_MANAGEMENT_FORM_ROUTE).toBe('/project-management/forms')
    expect(isPublicProjectManagementFormRoute('/project-management/forms/intake')).toBe(true)
    expect(isPublicProjectManagementFormRoute('/dashboard/project-management/forms/intake')).toBe(false)
  })

  it('makes every former customer trial path unavailable', () => {
    for (const segment of ['trial', 'try', 'guest', 'signup', 'sign-up']) {
      expect(isRemovedCustomerTrialRoute([segment])).toBe(true)
    }
    expect(isRemovedCustomerTrialRoute(['projects', 'trial-balance'])).toBe(false)
  })

  it('requires the explicit internal evaluation gate', () => {
    expect(canAccessInternalEvaluationRoute(['internal', 'eval'], false)).toBe(false)
    expect(canAccessInternalEvaluationRoute(['internal', 'eval'], true)).toBe(true)
    expect(canAccessInternalEvaluationRoute(['internal', 'other'], true)).toBe(false)
  })
})
