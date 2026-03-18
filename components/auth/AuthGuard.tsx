'use client'

import { useAuth } from '@/contexts/AuthContext'
import { buildPhoneVerificationRedirect } from '@/lib/auth-redirect'
import { hasVerifiedPhone } from '@/lib/firebase'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean // true = require authentication, false = require no authentication
  requireVerifiedPhone?: boolean
  redirectTo?: string
}

export default function AuthGuard({ 
  children, 
  requireAuth = true, 
  requireVerifiedPhone = requireAuth,
  redirectTo 
}: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  useEffect(() => {
    if (loading) return // Wait for auth state to load

    if (requireAuth && !user) {
      // User must be authenticated but isn't
      router.push(redirectTo || '/')
    } else if (requireAuth && requireVerifiedPhone && user && !hasVerifiedPhone(user)) {
      router.push(buildPhoneVerificationRedirect(currentPath))
    } else if (!requireAuth && user) {
      // User must NOT be authenticated but is
      router.push(redirectTo || '/dashboard')
    }
  }, [currentPath, loading, redirectTo, requireAuth, requireVerifiedPhone, router, user])

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

  if (requireAuth && requireVerifiedPhone && user && !hasVerifiedPhone(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to phone verification...</p>
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
