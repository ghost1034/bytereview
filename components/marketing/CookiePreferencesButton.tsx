'use client'

import { useCookieConsentContext } from '@/components/privacy/CookieConsentProvider'

export function CookiePreferencesButton() {
  const { openPreferences } = useCookieConsentContext()
  return <button className="ps-button ps-button--outline" type="button" onClick={openPreferences}>Manage cookie preferences</button>
}
