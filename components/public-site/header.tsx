'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import AuthModal from '@/components/auth/AuthModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/contexts/AuthContext'
import { NAV_ITEMS } from './content'
import { SiteButton } from './ui'

export default function PublicHeader() {
  const pathname = usePathname()
  const { user, requiresMfaEnrollment } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const dashboardHref = requiresMfaEnrollment ? '/complete-signup' : '/dashboard'
  useEffect(() => setMenuOpen(false), [pathname])

  return <>
    <header className="ps-header" ref={setContainer}>
      {menuOpen && <div className="ps-nav-scrim" aria-hidden="true" />}
      <div className="ps-header__bar">
        <Link href="/" className="ps-header__brand" aria-label="CPAAutomation home"><span aria-hidden>CA</span></Link>
        <div className="ps-header__actions">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild><button type="button" className="ps-menu-trigger" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}<span>{menuOpen ? 'Close' : 'Menu'}</span></button></PopoverTrigger>
            <PopoverContent container={container} className="ps-nav-popover" align="center" sideOffset={16} aria-label="Site navigation">
              <nav aria-label="Main navigation">{[{ label: 'Home', href: '/', number: '00' }, ...NAV_ITEMS].map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}</nav>
              <div className="ps-nav-popover__legal"><Link href="/privacy" onClick={() => setMenuOpen(false)}>Privacy</Link><Link href="/terms" onClick={() => setMenuOpen(false)}>Terms</Link></div>
            </PopoverContent>
          </Popover>
          {user ? <SiteButton href={dashboardHref}>Dashboard</SiteButton> : <SiteButton onClick={() => { setMenuOpen(false); setAuthOpen(true) }}>Get started</SiteButton>}
        </div>
      </div>
    </header>
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo="/dashboard" defaultTab="signin" />
  </>
}
