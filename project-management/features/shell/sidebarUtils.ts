import type { LucideIcon } from 'lucide-react'

export const COLOR_MAP: Record<string, string> = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
}

export function projectDotColor(color: string): string {
  return COLOR_MAP[color] ?? 'var(--primary)'
}

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  tourId?: string
}

export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
