'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import MainLayout from '@/components/layout/main-layout'
import { isPublicSitePath, shouldShowPublicPreloader } from './content'
import PublicFooter from './footer'
import PublicHeader from './header'

export function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [preloading, setPreloading] = useState(false)
  const isPublicSite = isPublicSitePath(pathname)

  useEffect(() => {
    let hasPreloaded = true
    try {
      hasPreloaded = sessionStorage.getItem('ps-preloaded') === 'true'
    } catch {
      // Storage can be blocked; the site must remain usable without it.
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!shouldShowPublicPreloader({ isPublicSite, hasPreloaded, reducedMotion })) return
    setPreloading(true)
    try {
      sessionStorage.setItem('ps-preloaded', 'true')
    } catch {
      // The fail-open timer below still removes the preloader.
    }
    const timer = window.setTimeout(() => setPreloading(false), 850)
    return () => window.clearTimeout(timer)
  }, [isPublicSite])

  if (!isPublicSite) return <MainLayout>{children}</MainLayout>

  return (
    <div className="ps-site ps-template">
      {preloading && <div className="ps-preloader" aria-hidden><span>CA</span><strong>CPAAutomation</strong></div>}
      <a href="#main-content" className="ps-skip-link">Skip to content</a>
      <PublicHeader />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <PublicFooter />
    </div>
  )
}
