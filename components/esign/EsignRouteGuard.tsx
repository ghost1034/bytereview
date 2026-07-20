'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { useEsignContext } from '@/hooks/useEnvelopes'
import { esignRouteRule, hasEsignAccess } from '@/lib/esign/access'

export function EsignRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const context = useEsignContext()
  const rule = esignRouteRule(pathname)
  if (!rule) return children
  if (context.isLoading) return <div className="py-12 text-center text-sm text-foreground-muted">Checking E-Signature access…</div>
  if (context.data && hasEsignAccess(context.data, rule)) return children
  return <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center"><h1 className="text-xl font-semibold">E-Signature access unavailable</h1><p className="mt-2 text-sm text-foreground-muted">Your firm settings or permission profile do not allow this workspace.</p><Button asChild className="mt-5" variant="outline"><Link href="/dashboard/esign">Back to envelopes</Link></Button></div>
}
