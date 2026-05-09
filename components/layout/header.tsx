'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bot,
  ChevronDown,
  Clock,
  FileText,
  Files,
  FolderKanban,
  LogOut,
  Menu,
  PenTool,
  User,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ProductCard } from '@/components/marketing/product-card'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from '@/components/auth/AuthModal'
import { cn } from '@/lib/utils'

interface ProductLink {
  label: string
  href: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  status?: 'soon'
}

const PRODUCT_LINKS: ProductLink[] = [
  {
    label: 'Document Analysis',
    href: '/#extraction-features',
    description: 'AI extraction & automations',
    icon: FileText,
  },
  {
    label: 'Form Fill',
    href: '/#form-fill-showcase',
    description: 'AI form filling from your documents',
    icon: Files,
  },
  {
    label: 'Inkwise',
    href: '/#inkwise-showcase',
    description: 'AI writing with citations',
    icon: PenTool,
  },
  {
    label: 'Chrona',
    href: '/#chrona-showcase',
    description: 'AI time tracking',
    icon: Clock,
    status: 'soon',
  },
  {
    label: 'Claw Series',
    href: '/#claw-showcase',
    description: 'AI digital workers',
    icon: Bot,
    status: 'soon',
  },
  {
    label: 'AI Analysis Suite',
    href: '/#roadmap',
    description: 'Reconciliation & flux analysis',
    icon: BarChart3,
    status: 'soon',
  },
  {
    label: 'AI Productivity Suite',
    href: '/#roadmap',
    description: 'Project management & more',
    icon: FolderKanban,
    status: 'soon',
  },
]

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/demo', label: 'Demo' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProductsOpen, setIsProductsOpen] = useState(false)
  const productsRef = useRef<HTMLDivElement>(null)
  const { user, loading, requiresMfaEnrollment, signOut } = useAuth()

  // Close products dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setIsProductsOpen(false)
      }
    }
    if (isProductsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProductsOpen])

  // Close on ESC
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsProductsOpen(false)
    }
    if (isProductsOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isProductsOpen])

  const primaryAuthenticatedHref = requiresMfaEnrollment
    ? '/complete-signup'
    : '/dashboard'
  const primaryAuthenticatedLabel = requiresMfaEnrollment
    ? 'Secure Sign-In'
    : 'Dashboard'

  const handleAuthAction = () => {
    if (user) {
      void signOut()
    } else {
      setIsAuthModalOpen(true)
    }
  }

  const userInitials = (() => {
    const name = user?.displayName || user?.email || ''
    if (!name) return 'U'
    const parts = name.split(/[@\s.]+/).filter(Boolean)
    return (
      ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() ||
      name[0]?.toUpperCase() ||
      'U'
    )
  })()

  const isActive = (path: string) => pathname === path

  return (
    <nav
      className="app-header fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/85 backdrop-blur transition-transform duration-300 supports-[backdrop-filter]:bg-background/70"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[var(--header-height)] items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="CPAAutomation home"
            >
              <Image
                src="/logo.png"
                alt="CPAAutomation"
                width={240}
                height={80}
                className="h-10 w-auto"
                priority
              />
            </Link>

            <div className="hidden items-center gap-6 md:flex">
              {user && (
                <Link
                  href={primaryAuthenticatedHref}
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive(primaryAuthenticatedHref)
                      ? 'text-foreground'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  {primaryAuthenticatedLabel}
                </Link>
              )}

              {/* Products mega-menu */}
              <div
                ref={productsRef}
                className="relative"
                onMouseEnter={() => setIsProductsOpen(true)}
                onMouseLeave={() => setIsProductsOpen(false)}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isProductsOpen}
                  className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => setIsProductsOpen((open) => !open)}
                >
                  Products
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      isProductsOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>

                {isProductsOpen && (
                  <div
                    role="menu"
                    aria-label="Products"
                    className="absolute left-0 top-full z-10 pt-2"
                  >
                    <div className="w-80 rounded-xl border border-border bg-popover p-2 shadow-lg">
                      <div className="space-y-1">
                        {PRODUCT_LINKS.map((product) => (
                          <ProductCard
                            key={product.label}
                            icon={product.icon}
                            name={product.label}
                            description={product.description}
                            href={product.href}
                            size="sm"
                            tone="brand"
                            status={product.status}
                            className="border-transparent bg-transparent shadow-none hover:bg-accent"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive(link.href)
                      ? 'text-foreground'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span
                      className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                      aria-hidden
                    >
                      {userInitials}
                    </span>
                    <span className="max-w-[140px] truncate text-foreground">
                      {user.displayName || user.email}
                    </span>
                    <ChevronDown
                      className="size-3.5 text-foreground-subtle"
                      aria-hidden
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {user.displayName || 'Signed in'}
                    </span>
                    {user.email && (
                      <span className="truncate text-xs font-normal text-foreground-muted">
                        {user.email}
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={primaryAuthenticatedHref} className="cursor-pointer">
                      <User className="mr-2 size-4" />
                      {primaryAuthenticatedLabel}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      void signOut()
                      router.push('/')
                    }}
                    className="cursor-pointer"
                  >
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={handleAuthAction} disabled={loading}>
                {loading ? 'Loading…' : 'Sign in'}
              </Button>
            )}
          </div>

          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="size-9"
                >
                  {isMobileMenuOpen ? (
                    <X className="size-5" aria-hidden />
                  ) : (
                    <Menu className="size-5" aria-hidden />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-sm overflow-y-auto p-0">
                <SheetHeader className="border-b border-border px-5 py-4">
                  <SheetTitle className="text-base font-semibold">
                    Menu
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-6 px-5 py-5">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
                      Products
                    </p>
                    <div className="space-y-1">
                      {PRODUCT_LINKS.map((product) => (
                        <ProductCard
                          key={product.label}
                          icon={product.icon}
                          name={product.label}
                          description={product.description}
                          href={product.href}
                          size="sm"
                          tone="brand"
                          status={product.status}
                          className="border-transparent bg-transparent shadow-none hover:bg-accent"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-border pt-4">
                    {user && (
                      <Link
                        href={primaryAuthenticatedHref}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-accent"
                      >
                        {primaryAuthenticatedLabel}
                      </Link>
                    )}
                    {NAV_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="block rounded-md px-2 py-2 text-sm font-medium text-foreground-muted hover:bg-accent hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>

                  <div className="border-t border-border pt-4">
                    {user ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 rounded-md bg-surface-muted p-3">
                          <span
                            className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                            aria-hidden
                          >
                            {userInitials}
                          </span>
                          <span className="truncate text-sm text-foreground">
                            {user.displayName || user.email}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setIsMobileMenuOpen(false)
                            handleAuthAction()
                          }}
                        >
                          <LogOut className="mr-1.5 size-4" aria-hidden />
                          Sign out
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => {
                          setIsMobileMenuOpen(false)
                          handleAuthAction()
                        }}
                        disabled={loading}
                      >
                        {loading ? 'Loading…' : 'Sign in'}
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </nav>
  )
}
