'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/contexts/AuthContext'
import { getCurrentAuthToken } from '@/lib/firebase'

export interface AdminTableSummary {
  name: string
  columns: number
  count: number | null
  grouped: boolean
}

export interface AdminGroup {
  slug: string
  label: string
  description: string
  tables: AdminTableSummary[]
  row_count: number
}

export interface AdminCatalog {
  groups: AdminGroup[]
  tables: AdminTableSummary[]
}

interface AdminContextValue {
  catalog: AdminCatalog
  catalogLoading: boolean
  request: <T>(path: string, options?: RequestInit) => Promise<T>
  download: (path: string, options?: RequestInit) => Promise<Response>
  refreshCatalog: () => Promise<void>
}

const AdminContext = React.createContext<AdminContextValue | null>(null)

async function adminResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCurrentAuthToken()
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = body.detail || message
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw Object.assign(new Error(message), { status: response.status })
  }
  return response
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await adminResponse(path, options)
  return response.json() as Promise<T>
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = React.useState(true)
  const [catalog, setCatalog] = React.useState<AdminCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = React.useState(false)

  const handleAccessError = React.useCallback((error: unknown): never => {
    const status = (error as { status?: number })?.status
    if (status === 401 || status === 403) router.replace('/dashboard')
    throw error
  }, [router])

  const request = React.useCallback(async <T,>(path: string, options?: RequestInit) => {
    try {
      return await adminFetch<T>(path, options)
    } catch (error) {
      return handleAccessError(error)
    }
  }, [handleAccessError])

  const download = React.useCallback(async (path: string, options?: RequestInit) => {
    try {
      return await adminResponse(path, options)
    } catch (error) {
      return handleAccessError(error)
    }
  }, [handleAccessError])

  const loadCatalog = React.useCallback(async () => {
    setCatalogLoading(true)
    try {
      const result = await adminFetch<AdminCatalog>('/api/admin/console/catalog')
      setCatalog(result)
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace('/')
      return
    }

    Promise.all([
      adminFetch<{ authenticated: boolean }>('/api/admin/console/auth'),
      loadCatalog(),
    ])
      .catch((error) => {
        const status = (error as { status?: number })?.status
        if (status === 401 || status === 403) router.replace('/dashboard')
      })
      .finally(() => setChecking(false))
  }, [authLoading, loadCatalog, router, user])

  const refreshCatalog = React.useCallback(() => loadCatalog(), [loadCatalog])

  if (authLoading || checking || !user || !catalog) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8]">
        <Loader2 className="size-6 animate-spin text-slate-500" aria-label="Checking admin access" />
      </div>
    )
  }

  return (
    <AdminContext.Provider value={{
      catalog,
      catalogLoading,
      request,
      download,
      refreshCatalog,
    }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const context = React.useContext(AdminContext)
  if (!context) throw new Error('useAdmin must be used within AdminProvider')
  return context
}
