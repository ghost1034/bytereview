import { describe, expect, it } from 'vitest'

import { resolveFirebaseClientConfig } from './firebase-config'

describe('resolveFirebaseClientConfig', () => {
  it('returns an inert SDK-safe config when Firebase is not needed or configured', () => {
    const result = resolveFirebaseClientConfig({})

    expect(result.isConfigured).toBe(false)
    expect(result.missingVariables).toEqual([
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_APP_ID',
    ])
    expect(result.config.apiKey).toBeTruthy()
    expect(result.isAnalyticsConfigured).toBe(false)
  })

  it('derives the default auth domain for a complete configuration', () => {
    const result = resolveFirebaseClientConfig({
      apiKey: 'api-key',
      projectId: 'project-id',
      appId: 'app-id',
    })

    expect(result.isConfigured).toBe(true)
    expect(result.config.authDomain).toBe('project-id.firebaseapp.com')
    expect(result.isAnalyticsConfigured).toBe(false)
    expect(result.missingVariables).toEqual([])
  })

  it('enables Analytics only when a complete config includes a measurement ID', () => {
    const result = resolveFirebaseClientConfig({
      apiKey: 'api-key',
      projectId: 'project-id',
      appId: 'app-id',
      measurementId: 'G-TEST123',
    })

    expect(result.isConfigured).toBe(true)
    expect(result.isAnalyticsConfigured).toBe(true)
    expect(result.config.measurementId).toBe('G-TEST123')
  })

  it('treats whitespace-only values as missing', () => {
    const result = resolveFirebaseClientConfig({
      apiKey: '  ',
      projectId: 'project-id',
      appId: 'app-id',
    })

    expect(result.isConfigured).toBe(false)
    expect(result.missingVariables).toContain('NEXT_PUBLIC_FIREBASE_API_KEY')
  })
})
