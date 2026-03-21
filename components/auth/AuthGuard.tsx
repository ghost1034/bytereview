'use client'

import { useAuth } from '@/contexts/AuthContext'
import { buildMfaEnrollmentRedirect } from '@/lib/auth-redirect'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean // true = require authentication, false = require no authentication
  requireMfaEnrollment?: boolean
  redirectTo?: string
}

export default function AuthGuard({ 
  children, 
  requireAuth = true, 
  requireMfaEnrollment = requireAuth,
  redirectTo 
}: AuthGuardProps) {
  const { loading, requiresMfaEnrollment, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return // Wait for auth state to load

    const currentPath = typeof window === 'undefined'
      ? pathname
      : `${window.location.pathname}${window.location.search}`

    if (requireAuth && !user) {
      // User must be authenticated but isn't
      router.push(redirectTo || '/')
    } else if (requireAuth && requireMfaEnrollment && user && requiresMfaEnrollment) {
      router.push(buildMfaEnrollmentRedirect(currentPath))
    } else if (!requireAuth && user) {
      // User must NOT be authenticated but is
      router.push(redirectTo || '/dashboard')
    }
  }, [loading, pathname, redirectTo, requireAuth, requireMfaEnrollment, requiresMfaEnrollment, router, user])

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

  if (requireAuth && requireMfaEnrollment && user && requiresMfaEnrollment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to sign-in security setup...</p>
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
