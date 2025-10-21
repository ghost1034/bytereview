"use client";

import { useCookieConsentContext } from '@/components/privacy/CookieConsentProvider';

export function useCookieConsent() {
  return useCookieConsentContext();
}
