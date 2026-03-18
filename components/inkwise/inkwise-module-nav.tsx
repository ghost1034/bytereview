'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, FileText, LibraryBig, PenSquare } from 'lucide-react'

import { cn } from '@/lib/utils'

const items = [
  { href: '/dashboard/inkwise/write', label: 'Write', icon: PenSquare },
  { href: '/dashboard/inkwise/references', label: 'References', icon: LibraryBig },
  { href: '/dashboard/inkwise/templates', label: 'Templates', icon: FileText },
  { href: '/dashboard/inkwise/help', label: 'Help', icon: BookOpen },
]

export function InkwiseModuleNav() {
  const pathname = usePathname()

  return (
    <nav className="rounded-2xl border bg-slate-50/80 p-1.5 shadow-sm" aria-label="Inkwise sections">
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
