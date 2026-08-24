'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import AuthModal from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedAction({ destination, children, className = 'ps-button' }: { destination: string; children: React.ReactNode; className?: string }) {
  const router = useRouter()
  const { loading, user } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className={className} disabled={loading} type="button" onClick={() => user ? router.push(destination) : setOpen(true)}>{loading ? 'Loading…' : children}</button>
      <AuthModal isOpen={open} onClose={() => setOpen(false)} redirectTo={destination} defaultTab="signup" />
    </>
  )
}
