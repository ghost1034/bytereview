'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean // true = require authentication, false = require no authentication
  redirectTo?: string
}

export default function AuthGuard({ 
  children, 
  requireAuth = true, 
  redirectTo 
}: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return // Wait for auth state to load

    if (requireAuth && !user) {
      // User must be authenticated but isn't
      router.push(redirectTo || '/')
    } else if (!requireAuth && user) {
      // User must NOT be authenticated but is
      router.push(redirectTo || '/dashboard')
    }
  }, [user, loading, requireAuth, redirectTo, router])

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show nothing while redirecting
  if (requireAuth && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!requireAuth && user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  // Render children if auth requirements are met
  return <>{children}</>
}