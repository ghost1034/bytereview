"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
};

type ConsentState = {
  version: number;
  updatedAt: string;
  categories: ConsentCategories;
};

const CONSENT_VERSION = 1;
const STORAGE_KEY = `cpaa_cookie_consent_v${CONSENT_VERSION}`;

interface CookieConsentContextValue {
  consent: ConsentCategories | null;
  showBanner: boolean;
  isPreferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  acceptNecessary: () => void;
  savePreferences: (updated: Omit<ConsentCategories, 'necessary'>) => void;
  resetPreferences: () => void;
  isAllowed: (category: 'analytics' | 'functional' | 'marketing') => boolean;
}

const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(undefined);

function defaultCategories(): ConsentCategories {
  return {
    necessary: true,
    analytics: false,
    functional: false,
    marketing: false,
  };
}

function readFromStorage(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToStorage(state: ConsentState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentCategories | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isPreferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const stored = readFromStorage();
    if (stored?.categories) {
      setConsent(stored.categories);
      setShowBanner(false);
    } else {
      setConsent(null);
      setShowBanner(true);
    }
  }, []);

  const persist = useCallback((categories: ConsentCategories) => {
    setConsent(categories);
    writeToStorage({
      version: CONSENT_VERSION,
      updatedAt: new Date().toISOString(),
      categories,
    });
  }, []);

  const acceptAll = useCallback(() => {
    const categories: ConsentCategories = { necessary: true, analytics: true, functional: true, marketing: true };
    persist(categories);
    setShowBanner(false);
    setPreferencesOpen(false);
  }, [persist]);

  const acceptNecessary = useCallback(() => {
    const categories: ConsentCategories = { necessary: true, analytics: false, functional: false, marketing: false };
    persist(categories);
    setShowBanner(false);
    setPreferencesOpen(false);
  }, [persist]);

  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);

  const savePreferences = useCallback((updated: Omit<ConsentCategories, 'necessary'>) => {
    const categories: ConsentCategories = { necessary: true, ...updated };
    persist(categories);
    setShowBanner(false);
    setPreferencesOpen(false);
  }, [persist]);

  const resetPreferences = useCallback(() => {
    const categories = defaultCategories();
    setConsent(categories);
  }, []);

  const isAllowed = useCallback((category: 'analytics' | 'functional' | 'marketing') => {
    if (!consent) return false;
    return !!consent[category];
  }, [consent]);

  const value = useMemo<CookieConsentContextValue>(() => ({
    consent,
    showBanner,
    isPreferencesOpen,
    openPreferences,
    closePreferences,
    acceptAll,
    acceptNecessary,
    savePreferences,
    resetPreferences,
    isAllowed,
  }), [consent, showBanner, isPreferencesOpen, openPreferences, closePreferences, acceptAll, acceptNecessary, savePreferences, resetPreferences, isAllowed]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsentContext() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) throw new Error('useCookieConsentContext must be used within CookieConsentProvider');
  return ctx;
}
