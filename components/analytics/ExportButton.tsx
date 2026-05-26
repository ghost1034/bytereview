'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileJson, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ExportFormat = 'csv' | 'excel' | 'json'

interface ExportButtonProps {
  onExport: (format: ExportFormat) => void
  className?: string
  allowedFormats?: ExportFormat[]
  label?: string
}

const ALL_FORMATS = [
  { id: 'excel' as const, label: 'Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-green-600' },
  { id: 'csv' as const, label: 'CSV File', icon: FileText, color: 'text-blue-600' },
  { id: 'json' as const, label: 'JSON Data', icon: FileJson, color: 'text-amber-600' },
]

export function ExportButton({ onExport, className, allowedFormats, label = 'Export' }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const formats = allowedFormats
    ? ALL_FORMATS.filter((f) => allowedFormats.includes(f.id))
    : ALL_FORMATS

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-all hover:bg-surface-muted',
          className,
        )}
      >
        <Download size={16} className="text-blue-600" />
        {label}
        <ChevronDown size={14} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="animate-in fade-in zoom-in absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card py-2 shadow-xl duration-200">
            <div className="mb-1 px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Select Format</p>
            </div>
            {formats.map((format) => (
              <button
                key={format.id}
                type="button"
                onClick={() => {
                  onExport(format.id)
                  setIsOpen(false)
                }}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted"
              >
                <div className={cn('rounded-lg bg-surface-muted p-1.5 transition-colors group-hover:bg-card', format.color)}>
                  <format.icon size={16} />
                </div>
                <span className="text-sm font-medium text-foreground">{format.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ExportButton
