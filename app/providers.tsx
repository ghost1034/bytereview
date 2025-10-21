'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import { useState } from 'react'

import { CookieConsentProvider } from '@/components/privacy/CookieConsentProvider'
import CookieBanner from '@/components/privacy/CookieBanner'
import CookiePreferencesModal from '@/components/privacy/CookiePreferencesModal'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CookieConsentProvider>
            {children}
            <CookieBanner />
            <CookiePreferencesModal />
            <Toaster />
          </CookieConsentProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}