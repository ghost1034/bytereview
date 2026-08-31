import {
  BarChart3,
  Bot,
  Clock3,
  FileCheck2,
  FileSearch2,
  FileSignature,
  Files,
  FolderKanban,
  Globe2,
  GraduationCap,
  PenTool,
} from 'lucide-react'

export interface PublicNavItem {
  label: string
  href: string
  number: string
}

export interface ProductItem {
  name: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
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

export function shouldShowPublicPreloader({
  isPublicSite,
  hasPreloaded,
  reducedMotion,
}: {
  isPublicSite: boolean
  hasPreloaded: boolean
  reducedMotion: boolean
}) {
  return isPublicSite && !hasPreloaded && !reducedMotion
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

export const PRODUCTS: ProductItem[] = [
  {
    name: 'Universal Document Analysis',
    description: 'Extract, validate, and automate work from complex documents.',
    href: '/features#document-intelligence',
    icon: FileSearch2,
  },
  {
    name: 'Form Fill',
    description: 'Move source data into PDF and Word forms with AI.',
    href: '/features#document-intelligence',
    icon: Files,
  },
  {
    name: 'Inkwise',
    description: 'Draft grounded professional writing with citations.',
    href: '/features#knowledge-work',
    icon: PenTool,
  },
  {
    name: 'Tasklytic',
    description: 'Projects, forms, time, reporting, and team coordination.',
    href: '/features#practice-operations',
    icon: FolderKanban,
  },
  {
    name: 'Prepared by Client',
    description: 'Secure request lists, evidence collection, and review.',
    href: '/features#knowledge-work',
    icon: FileCheck2,
  },
  {
    name: 'E-Signature',
    description: 'Prepare, send, sign, and verify documents.',
    href: '/features#knowledge-work',
    icon: FileSignature,
  },
  {
    name: 'Chrona',
    description: 'Reconstruct billable work without manual timers.',
    href: '/features#practice-operations',
    icon: Clock3,
  },
  {
    name: 'AI Analytics Suite',
    description: 'Variance, reconciliation, fixed assets, and research bots.',
    href: '/features#analytics',
    icon: BarChart3,
  },
  {
    name: 'TaxAtlas',
    description: 'Global tax rates, law, tariffs, and change monitoring.',
    href: '/features#analytics',
    icon: Globe2,
  },
  {
    name: 'Claw Series',
    description: 'Deployable AI digital workers for accounting and legal work.',
    href: '/claw',
    icon: Bot,
  },
  {
    name: 'CPE Tracker',
    description: 'Track continuing professional education at no cost.',
    href: '/dashboard/cpe-tracker',
    icon: GraduationCap,
  },
]

export const PRODUCT_NAMES = PRODUCTS.map((product) => product.name)
