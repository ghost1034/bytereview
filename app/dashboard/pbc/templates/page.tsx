'use client'

import Link from 'next/link'
import { ArrowLeft, Library } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { pbcApi } from '@/lib/pbc/api'

export default function PbcTemplatesPage() {
  const query = useQuery({ queryKey: ['pbc', 'templates'], queryFn: pbcApi.templates })
  return <div className="space-y-6"><div><Link href="/dashboard/pbc" className="inline-flex items-center gap-1 text-sm text-foreground-muted"><ArrowLeft className="size-4" />PBC workspace</Link><div className="mt-3"><h1 className="text-2xl font-semibold">Request-list templates</h1><p className="mt-1 text-sm text-foreground-muted">Reuse consistent requests and tailor every list before publishing.</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(query.data?.templates || []).map((template) => <article key={String(template.id)} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Library className="size-4" /></div><h2 className="mt-4 font-semibold">{String(template.name)}</h2><p className="mt-1 text-sm text-foreground-muted">{String(template.description || 'Reusable PBC request list')}</p><p className="mt-4 text-xs font-medium uppercase tracking-wide text-foreground-muted">{Array.isArray(template.items) ? template.items.length : 0} requests · {String(template.engagement_type)}</p></article>)}{!query.isLoading && !query.data?.templates.length && <div className="rounded-xl border border-dashed p-10 text-center md:col-span-2 xl:col-span-3"><Library className="mx-auto size-8 text-foreground-muted" /><p className="mt-3 font-medium">No templates yet</p></div>}</div></div>
}
