'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import AuthModal from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'

interface ProductExploreLinkProps {
  href: string
  productName: string
}

export function ProductExploreLink({ href, productName }: ProductExploreLinkProps) {
  const { user } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (user) return

    event.preventDefault()
    setAuthOpen(true)
  }

  return (
    <>
      <Link href={href} aria-label={`Explore ${productName}`} onClick={handleClick}>
        Explore <ArrowUpRight aria-hidden />
      </Link>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        redirectTo={href}
        defaultTab="signin"
      />
    </>
  )
}
