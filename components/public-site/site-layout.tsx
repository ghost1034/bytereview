'use client'

import { usePathname } from 'next/navigation'

import MainLayout from '@/components/layout/main-layout'
import { isPublicSitePath } from './content'
import PublicFooter from './footer'
import PublicHeader from './header'

export function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublicSite = isPublicSitePath(pathname)

  if (!isPublicSite) return <MainLayout>{children}</MainLayout>

  return (
    <div className="ps-site ps-template">
      <a href="#main-content" className="ps-skip-link">Skip to content</a>
      <PublicHeader />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <PublicFooter />
    </div>
  )
}
