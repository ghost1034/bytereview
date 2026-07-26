'use client'

import * as React from 'react'
import { Database, Loader2, LockKeyhole } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  token: string
  catalog: AdminCatalog | null
  catalogLoading: boolean
  request: <T>(path: string, options?: RequestInit) => Promise<T>
  refreshCatalog: () => Promise<void>
  signOut: () => void
}

const AdminContext = React.createContext<AdminContextValue | null>(null)
const TOKEN_KEY = 'cpaa-admin-console-token'

async function adminFetch<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      'X-Admin-Token': token,
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
  return response.json() as Promise<T>
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState('')
  const [candidate, setCandidate] = React.useState('')
  const [checking, setChecking] = React.useState(true)
  const [error, setError] = React.useState('')
  const [catalog, setCatalog] = React.useState<AdminCatalog | null>(null)
  const [catalogLoading, setCatalogLoading] = React.useState(false)

  const request = React.useCallback(<T,>(path: string, options?: RequestInit) => {
    return adminFetch<T>(token, path, options)
  }, [token])

  const loadCatalog = React.useCallback(async (activeToken: string) => {
    setCatalogLoading(true)
    try {
      const result = await adminFetch<AdminCatalog>(activeToken, '/api/admin/console/catalog')
      setCatalog(result)
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (!saved) {
      setChecking(false)
      return
    }
    adminFetch<{ authenticated: boolean }>(saved, '/api/admin/console/auth')
      .then(() => {
        setToken(saved)
        return loadCatalog(saved)
      })
      .catch(() => sessionStorage.removeItem(TOKEN_KEY))
      .finally(() => setChecking(false))
  }, [loadCatalog])

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!candidate.trim()) return
    setChecking(true)
    setError('')
    try {
      await adminFetch(candidate.trim(), '/api/admin/console/auth')
      sessionStorage.setItem(TOKEN_KEY, candidate.trim())
      setToken(candidate.trim())
      await loadCatalog(candidate.trim())
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Access denied')
    } finally {
      setChecking(false)
    }
  }

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken('')
    setCandidate('')
    setCatalog(null)
  }

  const refreshCatalog = React.useCallback(() => loadCatalog(token), [loadCatalog, token])

  if (checking && !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8]">
        <Loader2 className="size-6 animate-spin text-slate-500" aria-label="Checking admin access" />
      </div>
    )
  }

  if (!token) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef1f5] px-4">
        <div className="absolute inset-x-0 top-0 h-64 bg-[#111827]" />
        <div className="absolute left-1/2 top-20 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
        <form onSubmit={authenticate} className="relative w-full max-w-[420px] rounded-2xl border border-white/70 bg-white p-8 shadow-2xl shadow-slate-900/15">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <Database className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">CPAAutomation</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">Admin console</h1>
            </div>
          </div>
          <p className="mb-6 text-sm leading-6 text-slate-600">
            Enter the system administrator token to view operational and database records across every product.
          </p>
          <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="admin-token">Admin token</label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="admin-token"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              className="h-11 pl-10"
              placeholder="Enter ADMIN_TOKEN"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
          <Button className="mt-5 h-11 w-full bg-slate-950 hover:bg-slate-800" disabled={checking || !candidate.trim()}>
            {checking && <Loader2 className="size-4 animate-spin" />}
            Open console
          </Button>
          <p className="mt-5 text-center text-xs text-slate-400">Credentials stay in this browser tab and are never placed in the URL.</p>
        </form>
      </main>
    )
  }

  return (
    <AdminContext.Provider value={{
      token,
      catalog,
      catalogLoading,
      request,
      refreshCatalog,
      signOut,
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
