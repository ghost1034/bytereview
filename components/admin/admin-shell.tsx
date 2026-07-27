'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity, BarChart3, Bot, ChevronLeft, ChevronRight, Clock3,
  Database, FileInput, FileSignature, Files, FolderKanban, LayoutDashboard,
  LogOut, Menu, PenTool, ServerCog, Users, Workflow, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAdmin } from './admin-context'

const NAVIGATION = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Activity', href: '/admin/activity', icon: Activity },
  { label: 'Users & firms', href: '/admin/users', icon: Users },
  { label: 'Document extraction', href: '/admin/extraction', icon: Files },
  { label: 'Form Fill', href: '/admin/form-fill', icon: FileInput },
  { label: 'Inkwise', href: '/admin/inkwise', icon: PenTool },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Chrona', href: '/admin/chrona', icon: Clock3 },
  { label: 'E-Signature', href: '/admin/e-sign', icon: FileSignature },
  { label: 'Automations', href: '/admin/automations', icon: Workflow },
  { label: 'Platform', href: '/admin/platform', icon: ServerCog },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { catalog, signOut } = useAdmin()
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => setMobileOpen(false), [pathname])

  const nav = (
    <>
      <div className="flex h-[72px] items-center border-b border-white/10 px-4">
        <Link href="/admin" className="flex min-w-0 items-center gap-3 text-white">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 shadow-lg shadow-blue-500/20">
            <Database className="size-[18px]" />
          </div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">CPAAutomation</p><p className="text-[11px] text-slate-400">Admin console</p></div>}
        </Link>
        <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Admin navigation">
        {!collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">Workspace</p>}
        <div className="space-y-1">
          {NAVIGATION.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={cn(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                active ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
                collapsed && 'justify-center px-0',
              )}>
                <Icon className={cn('size-[17px] shrink-0', active && 'text-blue-400')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </div>
        <div className="my-4 border-t border-white/10" />
        {!collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">Data</p>}
        <Link href="/admin/database" title={collapsed ? 'Database explorer' : undefined} className={cn(
          'flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          pathname === '/admin/database' ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
          collapsed && 'justify-center px-0',
        )}>
          <FolderKanban className="size-[17px]" />
          {!collapsed && <span className="flex-1">Database explorer</span>}
          {!collapsed && catalog && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-300">{catalog.tables.length}</span>}
        </Link>
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className={cn('mb-2 flex items-center gap-3 rounded-lg bg-emerald-400/[0.08] px-3 py-2.5', collapsed && 'justify-center px-0')}>
          <span className="relative flex size-2 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
          {!collapsed && <div><p className="text-xs font-medium text-emerald-300">Read-only access</p><p className="mt-0.5 text-[10px] text-slate-500">Sensitive fields redacted</p></div>}
        </div>
        <button onClick={signOut} className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white', collapsed && 'justify-center px-0')}>
          <LogOut className="size-4" />{!collapsed && 'Lock console'}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-950">
      <aside className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col bg-[#111827] transition-[width] duration-200 lg:flex', collapsed ? 'w-[76px]' : 'w-[248px]')}>{nav}
        <button onClick={() => setCollapsed((value) => !value)} className="absolute -right-3 top-[86px] flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}</button>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu backdrop" /><aside className="relative flex h-full w-[280px] flex-col bg-[#111827]">{nav}</aside></div>}
      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <button className="mr-4 text-slate-600 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Activity className="size-4 text-emerald-500" /><span>Production data</span><span className="text-slate-300">/</span><span className="font-medium text-slate-800">Read-only</span></div>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:flex"><Bot className="size-3.5" />System administrator</div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  )
}
