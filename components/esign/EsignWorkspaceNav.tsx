'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleHelp, FileCheck2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const items = [
  { href: '/dashboard/esign', label: 'Envelopes' },
  { href: '/dashboard/esign/templates', label: 'Templates' },
  { href: '/dashboard/esign/bulk', label: 'Bulk sends' },
  { href: '/dashboard/esign/powerforms', label: 'PowerForms' },
  { href: '/dashboard/esign/reports', label: 'Reports' },
  { href: '/dashboard/esign/verify', label: 'Verify' },
]

export function EsignWorkspaceNav() {
  const pathname = usePathname() ?? ''
  const immersive =
    /\/dashboard\/esign\/[^/]+\/(prepare|fields|review|documents|recipients)$/.test(pathname) ||
    pathname.startsWith('/dashboard/esign/sign/') ||
    /\/dashboard\/esign\/templates\/[^/]+/.test(pathname)

  if (immersive) return null

  return (
    <header className="mb-6 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FileCheck2 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-subtle">CPAAutomation</p>
            <p className="font-semibold">E‑Signature</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/esign/legal">
            <CircleHelp className="mr-1.5 size-4" /> Legal & help
          </Link>
        </Button>
      </div>
      <nav aria-label="E-Signature workspace" className="flex gap-1 border-t border-border px-4">
        {items.map((item) => {
          const active = item.href === '/dashboard/esign'
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-foreground-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
