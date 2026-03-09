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
    <div className="rounded-2xl border bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
