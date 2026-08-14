import type { LucideIcon } from 'lucide-react'

export const COLOR_MAP: Record<string, string> = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
}

export function projectDotColor(color: string): string {
  return COLOR_MAP[color] ?? 'hsl(var(--primary))'
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
