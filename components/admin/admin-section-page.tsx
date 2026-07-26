'use client'

import * as React from 'react'
import { Database, Loader2, Search, Table2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AdminDataTable } from './admin-table'
import { useAdmin } from './admin-context'

function titleCaseTable(name: string) {
  return name.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function AdminSectionPage({ section }: { section: string }) {
  const { catalog, catalogLoading } = useAdmin()
  const [selected, setSelected] = React.useState('')
  const [tableSearch, setTableSearch] = React.useState('')
  const isDatabase = section === 'database'
  const group = catalog?.groups.find((item) => item.slug === section)
  const tables = isDatabase ? catalog?.tables ?? [] : group?.tables ?? []

  const filteredTables = React.useMemo(() => {
    if (!tableSearch.trim()) return tables
    const needle = tableSearch.toLowerCase()
    return tables.filter((table) => table.name.toLowerCase().includes(needle))
  }, [tableSearch, tables])

  React.useEffect(() => {
    if (tables.length && !tables.some((table) => table.name === selected)) setSelected(tables[0].name)
  }, [selected, tables])

  if (catalogLoading && !catalog) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
  if (!isDatabase && !group) return <div className="rounded-xl border border-slate-200 bg-white p-10"><h1 className="text-xl font-semibold">Unknown admin section</h1><p className="mt-2 text-sm text-slate-500">This product group is not registered in the admin catalog.</p></div>

  const title = isDatabase ? 'Database explorer' : group!.label
  const description = isDatabase ? 'Browse every SQLAlchemy-managed table in the CPAAutomation database.' : group!.description
  const totalRows = isDatabase ? tables.reduce((sum, item) => sum + (item.count ?? 0), 0) : group!.row_count

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600"><Database className="size-3.5" />Data oversight</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tables</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{tables.length}</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Records</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{totalRows.toLocaleString()}</p></div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03] xl:sticky xl:top-[100px]">
          <div className="border-b border-slate-200 p-3"><div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><Input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="Find a table…" className="h-9 pl-8 text-xs" /></div></div>
          <div className="max-h-[calc(100vh-230px)] overflow-y-auto p-2">
            {filteredTables.map((table) => <button key={table.name} onClick={() => setSelected(table.name)} className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors', selected === table.name ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}><Table2 className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate text-xs font-medium" title={table.name}>{titleCaseTable(table.name)}</span><span className={cn('text-[10px] tabular-nums', selected === table.name ? 'text-blue-500' : 'text-slate-400')}>{table.count === null ? '—' : table.count.toLocaleString()}</span></button>)}
            {!filteredTables.length && <p className="px-3 py-8 text-center text-xs text-slate-400">No tables found</p>}
          </div>
        </aside>
        <div className="min-w-0">{selected ? <AdminDataTable tableName={selected} /> : <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">Select a table</div>}</div>
      </div>
    </div>
  )
}
