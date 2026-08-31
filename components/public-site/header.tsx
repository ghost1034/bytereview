'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, Menu, X } from 'lucide-react'

import AuthModal from '@/components/auth/AuthModal'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { NAV_ITEMS } from './content'
import { SiteButton } from './ui'

export default function PublicHeader() {
  const pathname = usePathname()
  const { user, requiresMfaEnrollment } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const dashboardHref = requiresMfaEnrollment ? '/complete-signup' : '/dashboard'
  const changeMenuOpen = (open: boolean) => {
    setMenuOpen(open)
    if (!open) window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }

  return (
    <>
      <header className="ps-header">
        <div className="ps-header__bar">
          <Link href="/" className="ps-wordmark" aria-label="CPAAutomation home">
            <span className="ps-wordmark__mark" aria-hidden>CA</span>
            <span>CPAAutomation</span>
          </Link>

          <div className="ps-header__actions">
            <button
              ref={menuTriggerRef}
              type="button"
              className="ps-menu-trigger"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden />
              <span>Menu</span>
            </button>
            {user ? (
              <SiteButton href={dashboardHref}>Dashboard</SiteButton>
            ) : (
              <SiteButton onClick={() => setAuthOpen(true)}>Get started</SiteButton>
            )}
          </div>
        </div>
      </header>

      <Dialog open={menuOpen} onOpenChange={changeMenuOpen}>
        <DialogContent className="ps-menu-dialog">
          <DialogTitle className="sr-only">Site navigation</DialogTitle>
          <div className="ps-menu-dialog__top">
            <Link href="/" className="ps-wordmark ps-wordmark--light" onClick={() => changeMenuOpen(false)}>
              <span className="ps-wordmark__mark" aria-hidden>CA</span>
              <span>CPAAutomation</span>
            </Link>
            <button type="button" className="ps-menu-close" onClick={() => changeMenuOpen(false)}>
              <X aria-hidden />
              <span>Close</span>
            </button>
          </div>
          <nav className="ps-menu-nav" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active || undefined}
                  onClick={() => changeMenuOpen(false)}
                >
                  <span>{item.number}</span>
                  <strong>{item.label}</strong>
                  <ArrowUpRight aria-hidden />
                </Link>
              )
            })}
          </nav>
          <div className="ps-menu-dialog__footer">
            <p>AI software and forward-deployed consulting for professional work.</p>
            <Link href="/privacy" onClick={() => changeMenuOpen(false)}>Privacy</Link>
            <Link href="/terms" onClick={() => changeMenuOpen(false)}>Terms</Link>
          </div>
        </DialogContent>
      </Dialog>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        redirectTo="/dashboard"
        defaultTab="signin"
      />
    </>
  )
}
