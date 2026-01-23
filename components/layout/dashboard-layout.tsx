'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './sidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // Maintenance-mode admin gate
  const ADMIN_PASSWORD = 'Drakobaby#1!'
  const STORAGE_KEY = 'cpa_admin_unlocked'

  const [adminPassword, setAdminPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setUnlocked(true)
    } catch {
      // ignore storage errors
    }
  }, [])

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()

    if (adminPassword === ADMIN_PASSWORD) {
      setUnlocked(true)
      setError('')
      try {
        window.localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        // ignore storage errors
      }
      return
    }

    setError('Invalid admin password')
  }

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {!unlocked ? (
            <div className="max-w-md mx-auto mt-24 p-6 border rounded-lg bg-white shadow-sm">
              <h2 className="text-xl font-semibold mb-2">Maintenance Mode</h2>
              <p className="text-sm text-gray-600 mb-4">
                CPAAutomation is undergoing maintenance from Friday, January 23 to Sunday, January 25. Enter the admin password to unlock.
              </p>

              <form onSubmit={handleUnlock} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="admin-password">Admin password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password"
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button type="submit" className="w-full">
                  Unlock dashboard
                </Button>
              </form>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}
