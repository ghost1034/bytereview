import type { FirebaseOptions } from 'firebase/app'

export interface FirebaseClientEnvironment {
  apiKey?: string
  authDomain?: string
  projectId?: string
  appId?: string
  measurementId?: string
}

export interface ResolvedFirebaseClientConfig {
  config: FirebaseOptions
  isConfigured: boolean
  missingVariables: string[]
}

const UNCONFIGURED_FIREBASE_OPTIONS: FirebaseOptions = {
  // The Firebase Auth SDK requires a non-empty API key while it is being
  // constructed. These deliberately inert values let Next.js import client
  // modules while prerendering pages that do not use authentication.
  apiKey: 'firebase-not-configured',
  authDomain: 'firebase.invalid',
  projectId: 'firebase-not-configured',
  storageBucket: 'firebase-not-configured.invalid',
  appId: '1:0:web:firebase-not-configured',
}

const clean = (value: string | undefined) => value?.trim() || undefined

export function resolveFirebaseClientConfig(
  environment: FirebaseClientEnvironment,
): ResolvedFirebaseClientConfig {
  const apiKey = clean(environment.apiKey)
  const projectId = clean(environment.projectId)
  const appId = clean(environment.appId)
  const authDomain = clean(environment.authDomain) || (projectId ? `${projectId}.firebaseapp.com` : undefined)
  const measurementId = clean(environment.measurementId)

  const missingVariables = [
    !apiKey && 'NEXT_PUBLIC_FIREBASE_API_KEY',
    !projectId && 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    !appId && 'NEXT_PUBLIC_FIREBASE_APP_ID',
  ].filter((name): name is string => Boolean(name))

  if (missingVariables.length > 0) {
    return {
      config: UNCONFIGURED_FIREBASE_OPTIONS,
      isConfigured: false,
      missingVariables,
    }
  }

  return {
    config: {
      apiKey,
      authDomain,
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
      appId,
      measurementId,
    },
    isConfigured: true,
    missingVariables: [],
  }
}
