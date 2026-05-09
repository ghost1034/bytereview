'use client'

import Header from './header'
import Footer from './footer'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className={cn(
          'sr-only z-50 m-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
          'focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        Skip to content
      </a>
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 pt-[var(--header-height)] outline-none focus-visible:outline-none"
      >
        {children}
      </main>
      <Footer />
    </div>
  )
}
