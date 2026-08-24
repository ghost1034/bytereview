'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu, X } from 'lucide-react'
import { useState } from 'react'

import AuthModal from '@/components/auth/AuthModal'
import { useAuth } from '@/contexts/AuthContext'
import { consultingLinks, productLinks } from '@/lib/marketing/config'

function active(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MarketingHeader() {
  const pathname = usePathname()
  const { loading, signOut, user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="ps-header">
      <div className="ps-container ps-header__inner">
        <Link className="ps-brand" href="/" aria-label="CPAAutomation home" onClick={closeMenu}>
          <span className="ps-brand__mark" aria-hidden="true">C</span>
          <span>CPA<span>Automation</span></span>
        </Link>

        <nav className="ps-nav ps-nav--desktop" aria-label="Primary navigation">
          <div className="ps-nav-popover">
            <Link href="/features" aria-current={active(pathname, '/features') ? 'page' : undefined}>Products <ChevronDown size={14} /></Link>
            <div className="ps-nav-panel ps-nav-panel--products">
              {productLinks.map((item) => (
                <Link key={item.label} href={item.href}>
                  <strong>{item.label}</strong><span>{item.description}</span>
                </Link>
              ))}
            </div>
          </div>
          <Link href="/demo" aria-current={active(pathname, '/demo') ? 'page' : undefined}>Demo</Link>
          <div className="ps-nav-popover">
            <Link href="/consulting" aria-current={active(pathname, '/consulting') ? 'page' : undefined}>Consulting <ChevronDown size={14} /></Link>
            <div className="ps-nav-panel">
              {consultingLinks.map((item) => (
                <Link key={item.label} href={item.href}><strong>{item.label}</strong><span>{item.description}</span></Link>
              ))}
            </div>
          </div>
          <Link href="/pricing" aria-current={active(pathname, '/pricing') ? 'page' : undefined}>Pricing</Link>
          <Link href="/docs" aria-current={active(pathname, '/docs') ? 'page' : undefined}>Docs</Link>
          <Link href="/about" aria-current={active(pathname, '/about') ? 'page' : undefined}>About</Link>
          <Link href="/contact" aria-current={active(pathname, '/contact') ? 'page' : undefined}>Contact</Link>
        </nav>

        <div className="ps-account ps-nav--desktop">
          {loading ? <span className="ps-account__loading">Loading…</span> : user ? (
            <>
              <span className="ps-account__signed">Signed in</span>
              <Link className="ps-button ps-button--small ps-button--outline" href="/dashboard">Dashboard</Link>
              <button className="ps-text-button" type="button" onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <button className="ps-button ps-button--small" type="button" onClick={() => setAuthOpen(true)}>Secure Sign-In</button>
          )}
        </div>

        <button className="ps-menu-button" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X /> : <Menu />}
          <span>Menu</span>
        </button>
      </div>

      {menuOpen && (
        <nav className="ps-mobile-menu" aria-label="Mobile navigation">
          <div className="ps-container">
            <p className="ps-mobile-menu__label">Products</p>
            <div className="ps-mobile-menu__products">
              {productLinks.map((item) => <Link key={item.label} href={item.href} onClick={closeMenu}><strong>{item.label}</strong><span>{item.description}</span></Link>)}
            </div>
            <div className="ps-mobile-menu__main">
              {[{ label: 'Demo', href: '/demo' }, ...consultingLinks, { label: 'Pricing', href: '/pricing' }, { label: 'Docs', href: '/docs' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }].map((item) => (
                <Link key={item.label} href={item.href} onClick={closeMenu}>{item.label}</Link>
              ))}
            </div>
            <div className="ps-mobile-menu__account">
              {loading ? <span>Loading…</span> : user ? <><Link href="/dashboard" onClick={closeMenu}>Dashboard</Link><button type="button" onClick={() => void signOut()}>Sign out</button></> : <button type="button" onClick={() => { closeMenu(); setAuthOpen(true) }}>Sign in</button>}
            </div>
          </div>
        </nav>
      )}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} redirectTo="/dashboard" />
    </header>
  )
}
