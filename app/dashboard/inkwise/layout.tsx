'use client'

import { type ReactNode, useState, useEffect } from 'react'
import { Lock } from 'lucide-react'

import { InkwiseModuleNav } from '@/components/inkwise/inkwise-module-nav'

const ADMIN_PASSWORD = 'Drakobaby#1!'
const SESSION_KEY = 'inkwise-access-granted'

export default function InkwiseLayout({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setGranted(true)
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setGranted(true)
      setError('')
    } else {
      setError('Incorrect password.')
    }
  }

  if (!granted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-8 shadow-md"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Lock className="h-6 w-6 text-emerald-700" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Inkwise Access</h2>
            <p className="text-sm text-slate-500">
              This module is not yet publicly available. Enter the admin password to continue.
            </p>
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 via-white to-cyan-50 shadow-sm">
        <div className="flex flex-col gap-4 p-8">
          <div className="space-y-2">
            <div className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              CPAAutomation.ai Module
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Inkwise</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Draft grounded writing from your source library, manage reusable templates, and keep document-backed chat in one workspace.
            </p>
          </div>
          <InkwiseModuleNav />
        </div>
      </section>

      {children}
    </div>
  )
}
