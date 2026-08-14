'use client'

import * as React from 'react'

export type DashboardModuleChrome = {
  breadcrumbs?: Array<{ label: string; href?: string }>
  openCommandPalette?: () => void
  actions?: React.ReactNode
}

type DashboardModuleChromeRegistration = {
  update: (chrome: DashboardModuleChrome) => void
  unregister: () => void
}

export type DashboardModuleChromeRegistry = {
  register: (chrome: DashboardModuleChrome) => DashboardModuleChromeRegistration
}

/**
 * The token check prevents an older module cleanup from clearing a newer
 * registration during route transitions.
 */
export function createDashboardModuleChromeRegistry(
  onChange: (chrome: DashboardModuleChrome | null) => void,
): DashboardModuleChromeRegistry {
  let currentToken: symbol | null = null

  return {
    register(chrome) {
      const token = Symbol('dashboard-module-chrome')
      let registered = true
      currentToken = token
      onChange(chrome)

      return {
        update(nextChrome) {
          if (!registered || currentToken !== token) return
          onChange(nextChrome)
        },
        unregister() {
          if (!registered) return
          registered = false
          if (currentToken !== token) return
          currentToken = null
          onChange(null)
        },
      }
    },
  }
}

type DashboardModuleChromeContextValue = {
  chrome: DashboardModuleChrome | null
  registry: DashboardModuleChromeRegistry
}

const DashboardModuleChromeContext = React.createContext<DashboardModuleChromeContextValue | null>(null)

export function DashboardModuleChromeProvider({ children }: { children: React.ReactNode }) {
  const [chrome, setChrome] = React.useState<DashboardModuleChrome | null>(null)
  const registryRef = React.useRef<DashboardModuleChromeRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = createDashboardModuleChromeRegistry(setChrome)
  }

  const value = React.useMemo(
    () => ({ chrome, registry: registryRef.current! }),
    [chrome],
  )

  return (
    <DashboardModuleChromeContext.Provider value={value}>
      {children}
    </DashboardModuleChromeContext.Provider>
  )
}

export function useDashboardModuleChrome(chrome: DashboardModuleChrome) {
  const context = React.useContext(DashboardModuleChromeContext)
  if (!context) {
    throw new Error('useDashboardModuleChrome must be used within DashboardModuleChromeProvider')
  }

  const registrationRef = React.useRef<DashboardModuleChromeRegistration | null>(null)

  React.useLayoutEffect(() => {
    const registration = context.registry.register(chrome)
    registrationRef.current = registration
    return () => {
      registration.unregister()
      registrationRef.current = null
    }
    // Register only when the provider changes; updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.registry])

  React.useLayoutEffect(() => {
    registrationRef.current?.update(chrome)
  }, [chrome])
}

export function useRegisteredDashboardModuleChrome() {
  const context = React.useContext(DashboardModuleChromeContext)
  if (!context) {
    throw new Error('useRegisteredDashboardModuleChrome must be used within DashboardModuleChromeProvider')
  }
  return context.chrome
}

export function resolveDashboardCommandPalette(
  chrome: DashboardModuleChrome | null,
  openGlobalPalette: () => void,
) {
  return chrome?.openCommandPalette ?? openGlobalPalette
}
