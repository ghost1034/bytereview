'use client'

import { useEffect } from 'react'
import type { Analytics } from 'firebase/analytics'

import { firebaseApp, isFirebaseAnalyticsConfigured } from '@/lib/firebase'
import { useCookieConsentContext } from './CookieConsentProvider'

type AnalyticsSdk = typeof import('firebase/analytics')
type AnalyticsHandle = {
  analytics: Analytics
  sdk: AnalyticsSdk
}

let analyticsHandlePromise: Promise<AnalyticsHandle | null> | null = null

function loadAnalytics(): Promise<AnalyticsHandle | null> {
  if (!isFirebaseAnalyticsConfigured) return Promise.resolve(null)

  if (!analyticsHandlePromise) {
    analyticsHandlePromise = import('firebase/analytics')
      .then(async (sdk) => {
        if (!(await sdk.isSupported())) return null

        return {
          analytics: sdk.getAnalytics(firebaseApp),
          sdk,
        }
      })
      .catch((error) => {
        console.warn('Firebase Analytics could not be initialized.', error)
        return null
      })
  }

  return analyticsHandlePromise
}

/**
 * Starts Firebase Analytics only after analytics-cookie consent is granted and
 * turns collection back off if that consent is later withdrawn.
 */
export default function FirebaseAnalytics() {
  const { consent } = useCookieConsentContext()

  useEffect(() => {
    if (consent?.analytics) {
      void loadAnalytics().then((handle) => {
        if (handle) {
          handle.sdk.setAnalyticsCollectionEnabled(handle.analytics, true)
        }
      })
      return
    }

    // Do not load the Analytics SDK for visitors who have not opted in. If it
    // was already loaded earlier in this page session, immediately stop it.
    if (analyticsHandlePromise) {
      void analyticsHandlePromise.then((handle) => {
        if (handle) {
          handle.sdk.setAnalyticsCollectionEnabled(handle.analytics, false)
        }
      })
    }
  }, [consent?.analytics])

  return null
}
