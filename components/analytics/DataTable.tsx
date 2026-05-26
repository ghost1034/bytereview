'use client'

import React, { useMemo, useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  Search,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ColumnDef<T> {
  header: string
  accessorKey: keyof T | string
  cell?: (value: any, row: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  width?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  title?: string
  description?: string
  onRowClick?: (row: T) => void
  actions?: React.ReactNode
  pageSize?: number
  enableSelection?: boolean
  selectedRows?: (string | number)[]
  onSelectionChange?: (selectedIds: (string | number)[]) => void
  expandable?: (row: T) => React.ReactNode
  searchPlaceholder?: string
  rowActions?: (row: T) => React.ReactNode
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  title,
  description,
  onRowClick,
  actions,
  pageSize = 10,
  enableSelection = false,
  selectedRows: externalSelectedRows,
  onSelectionChange,
  expandable,
  searchPlaceholder = 'Search table...',
  rowActions,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | string; direction: 'asc' | 'desc' } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [internalSelectedRows, setInternalSelectedRows] = useState<Set<string | number>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set())

  const isExternalSelection = externalSelectedRows !== undefined
  const selectedRows = isExternalSelection ? new Set(externalSelectedRows) : internalSelectedRows

  const filteredData = useMemo(() => {
    if (!searchTerm) return data
    const q = searchTerm.toLowerCase()
    return data.filter((row) => Object.values(row).some((val) => String(val).toLowerCase().includes(q)))
  }, [data, searchTerm])

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData
    return [...filteredData].sort((a, b) => {
      const aVal = (a as any)[sortConfig.key]
      const bVal = (b as any)[sortConfig.key]
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredData, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handleSort = (key: keyof T | string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const toggleSelectAll = () => {
    let newSelected: Set<string | number>
    if (selectedRows.size === paginatedData.length) {
      newSelected = new Set()
    } else {
      newSelected = new Set(paginatedData.map((r) => r.id))
    }
    if (isExternalSelection) onSelectionChange?.(Array.from(newSelected))
    else setInternalSelectedRows(newSelected)
  }

  const toggleSelectRow = (id: string | number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    if (isExternalSelection) onSelectionChange?.(Array.from(newSelected))
    else setInternalSelectedRows(newSelected)
  }

  const toggleExpandRow = (id: string | number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) newExpanded.delete(id)
    else newExpanded.add(id)
    setExpandedRows(newExpanded)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {(title || description || actions) && (
        <div className="flex flex-col justify-between gap-4 border-b border-border p-6 md:flex-row md:items-center">
          <div>
            {title && <h3 className="text-lg font-bold text-foreground">{title}</h3>}
            {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" size={16} />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 rounded-xl border border-border bg-background py-2 pl-9 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {actions}
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-muted">
            <tr>
              {enableSelection && (
                <th className="w-10 p-4">
                  <input
                    type="checkbox"
                    checked={selectedRows.size > 0 && selectedRows.size === paginatedData.length}
                    onChange={toggleSelectAll}
                    className="rounded border-border text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {expandable && <th className="w-10 p-4" />}
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn(
                    'p-4 text-xs font-bold uppercase tracking-widest text-foreground-muted',
                    col.sortable && 'cursor-pointer transition-colors hover:text-foreground',
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.accessorKey)}
                >
                  <div className="flex items-center gap-2 whitespace-pre-wrap">
                    {col.header}
                    {col.sortable && (
                      <ArrowUpDown
                        size={12}
                        className={cn(
                          'transition-colors',
                          sortConfig?.key === col.accessorKey ? 'text-blue-600' : 'text-foreground-subtle',
                        )}
                      />
                    )}
                  </div>
                </th>
              ))}
              <th className="w-10 p-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length > 0 ? (
              paginatedData.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    className={cn(
                      'group transition-colors hover:bg-surface-muted',
                      onRowClick && 'cursor-pointer',
                      selectedRows.has(row.id) && 'bg-blue-50',
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {enableSelection && (
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded border-border text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {expandable && (
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleExpandRow(row.id)}
                          className="rounded p-1 transition-colors hover:bg-surface-muted"
                        >
                          {expandedRows.has(row.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    )}
                    {columns.map((col, j) => (
                      <td key={j} className="p-4 text-sm text-foreground">
                        {col.cell
                          ? col.cell((row as any)[col.accessorKey], row)
                          : String((row as any)[col.accessorKey] ?? '')}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    ) : (
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-foreground-subtle opacity-0 transition-all hover:bg-surface-muted hover:text-foreground group-hover:opacity-100"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandable && expandedRows.has(row.id) && (
                    <tr className="bg-surface-muted/50">
                      <td
                        colSpan={columns.length + (enableSelection ? 2 : 1) + 1}
                        className="p-6"
                      >
                        {expandable(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length + (enableSelection ? 1 : 0) + (expandable ? 1 : 0) + 1}
                  className="p-12 text-center"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-foreground-subtle">
                      <Search size={24} />
                    </div>
                    <p className="font-medium text-foreground-muted">No results found</p>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface-muted/30 p-4">
        <p className="text-xs font-medium text-foreground-muted">
          Showing <span className="text-foreground">{sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
          <span className="text-foreground">{Math.min(currentPage * pageSize, sortedData.length)}</span> of{' '}
          <span className="text-foreground">{sortedData.length}</span> results
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => prev - 1)}
            className="rounded-xl border border-border p-2 transition-all hover:bg-card disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                type="button"
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  'h-8 w-8 rounded-xl text-xs font-bold transition-all',
                  currentPage === page
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'border border-transparent text-foreground-muted hover:border-border hover:bg-card',
                )}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => prev + 1)}
            className="rounded-xl border border-border p-2 transition-all hover:bg-card disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default DataTable
