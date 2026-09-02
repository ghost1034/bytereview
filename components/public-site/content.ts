import { PRODUCT_CATALOG } from '@/lib/product-catalog'

export interface PublicNavItem {
  label: string
  href: string
  number: string
}

export interface ProductItem {
  name: string
  description: string
  href: string
  icon: (typeof PRODUCT_CATALOG)[number]['icon']
}

export const PUBLIC_ROUTES = [
  '/',
  '/demo',
  '/consulting',
  '/pricing',
  '/docs',
  '/about',
  '/contact',
  '/features',
  '/claw',
  '/case-study/LFO',
  '/privacy',
  '/terms',
] as const

export function isPublicSitePath(pathname: string) {
  return PUBLIC_ROUTES.some((route) => (
    route === '/'
      ? pathname === '/'
      : pathname === route || pathname.startsWith(`${route}/`)
  ))
}

export const NAV_ITEMS: PublicNavItem[] = [
  { label: 'Products', href: '/features', number: '01' },
  { label: 'Demo', href: '/demo', number: '02' },
  { label: 'Consulting', href: '/consulting', number: '03' },
  { label: 'Pricing', href: '/pricing', number: '04' },
  { label: 'Docs', href: '/docs', number: '05' },
  { label: 'About', href: '/about', number: '06' },
  { label: 'Contact', href: '/contact', number: '07' },
]

export const PRODUCTS: ProductItem[] = PRODUCT_CATALOG.map((product) => ({
  name: product.name,
  description: product.description,
  href: product.marketingHref,
  icon: product.icon,
}))

export const PRODUCT_NAMES = PRODUCTS.map((product) => product.name)
