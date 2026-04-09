'use client'

import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ADMIN_PASSWORD = 'Drakobaby#1!'
const STORAGE_KEY = 'cpaa_inkwise_maintenance_unlocked'

export function InkwiseMaintenanceLock({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  function handleUnlock() {
    if (password === ADMIN_PASSWORD) {
      setUnlocked(true)
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        // localStorage unavailable
      }
    } else {
      setError(true)
    }
  }

  if (unlocked) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[calc(100vh-var(--header-height)-2rem)] items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border bg-white p-10 shadow-sm">
        <div className="space-y-2 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Maintenance Mode
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Inkwise is Under Maintenance
          </h1>
          <p className="text-sm leading-relaxed text-slate-500">
            We are making major upgrades to better support multimodal sources.
            Please check back soon.
          </p>
        </div>

        <div className="space-y-3">
          <label
            htmlFor="admin-password"
            className="block text-sm font-medium text-slate-700"
          >
            Admin Password
          </label>
          <Input
            id="admin-password"
            type="password"
            placeholder="Enter admin password to unlock"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUnlock()
            }}
          />
          {error && (
            <p className="text-sm text-red-600">
              Incorrect password. Please try again.
            </p>
          )}
          <Button className="w-full" onClick={handleUnlock}>
            Unlock
          </Button>
        </div>
      </div>
    </div>
  )
}
