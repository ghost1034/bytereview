'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ProductTourProvider } from '@/components/tour/product-tour'
import { WelcomeTourDialog } from '@/components/tour/welcome-tour-dialog'
import {
  getProductForPathname,
  isImmersiveDashboardPath,
  PRODUCT_CATALOG,
} from '@/lib/product-catalog'
import { cn } from '@/lib/utils'

import {
  DashboardModuleChromeProvider,
  useRegisteredDashboardModuleChrome,
} from './dashboard-module-chrome'
import { DashboardTopbar } from './dashboard-topbar'
import {
  getProductLocalNavigation,
  ProductLocalNav,
  type ProductNavItem,
} from './product-local-nav'

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <DashboardModuleChromeProvider>
      <DashboardShellContent>{children}</DashboardShellContent>
    </DashboardModuleChromeProvider>
  )
}

function DashboardShellContent({ children }: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname() ?? '/dashboard'
  const product = getProductForPathname(pathname)
  const previousProductId = React.useRef(product?.id)
  const moduleChrome = useRegisteredDashboardModuleChrome()
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const isHub = pathname === '/dashboard'
  const isProjectManagement = product?.id === 'tasklytic'
  const isTaxAtlas = product?.id === 'taxatlas'
  const isFirmCrm = product?.id === 'firmcrm'
  const isViewportProduct = isProjectManagement || isTaxAtlas || isFirmCrm
  const isWideProduct = ['cpe-tracker', 'inkwise', 'pbc', 'analytics-suite', 'chrona'].includes(product?.id ?? '')

  const paletteItems = React.useMemo<ProductNavItem[]>(() => {
    if (isHub) {
      return PRODUCT_CATALOG.map((item) => ({
        label: item.name,
        href: item.appHref,
        icon: item.icon,
      }))
    }
    return getProductLocalNavigation(product?.id)
  }, [isHub, product?.id])

  const openLocalPalette = React.useCallback(() => setPaletteOpen(true), [])
  const openCommandPalette = moduleChrome?.openCommandPalette
    ?? (paletteItems.length ? openLocalPalette : undefined)

  React.useEffect(() => {
    const productId = product?.id
    if (previousProductId.current !== productId) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      previousProductId.current = productId
    }
  }, [product?.id])

  React.useEffect(() => {
    if (!openCommandPalette) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        openCommandPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommandPalette])

  if (isImmersiveDashboardPath(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-dvh bg-surface outline-none">
        <ProductTourProvider>{children}</ProductTourProvider>
      </main>
    )
  }

  return (
    <div className={cn(
      'flex min-h-dvh flex-col bg-surface',
      isHub && 'bg-surface-muted/55',
      isProjectManagement && 'h-svh max-h-svh overflow-hidden',
      (isTaxAtlas || isFirmCrm) && 'h-dvh max-h-dvh overflow-hidden',
    )}>
      <a
        href="#main-content"
        className={cn(
          'sr-only z-50 m-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
          'focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        Skip to content
      </a>

      <DashboardTopbar
        product={product}
        actions={moduleChrome?.actions}
        breadcrumbs={moduleChrome?.breadcrumbs}
        onOpenCommandPalette={openCommandPalette}
      />

      {product ? <ProductLocalNav productId={product.id} /> : null}

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'relative min-h-0 flex-1 outline-none focus-visible:outline-none',
          isViewportProduct && 'overflow-hidden',
        )}
      >
        <div
          className={cn(
            'h-full w-full',
            isViewportProduct
              ? 'min-h-0 max-w-none p-0'
              : 'mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
            !isViewportProduct && (isHub || isWideProduct ? 'max-w-[96rem]' : 'max-w-7xl'),
          )}
        >
          <ProductTourProvider>
            {product?.id === 'uda' ? <WelcomeTourDialog /> : null}
            {children}
          </ProductTourProvider>
        </div>
      </main>

      {paletteItems.length ? (
        <CommandDialog modal={false} open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder={isHub ? 'Search products…' : `Search ${product?.name ?? 'product'}…`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading={isHub ? 'Products' : product?.name}>
              {paletteItems.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.href}`}
                    onSelect={() => {
                      setPaletteOpen(false)
                      router.push(item.href)
                    }}
                  >
                    <Icon className="mr-2 size-4 text-foreground-muted" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      ) : null}
    </div>
  )
}
