'use client'

/**
 * Cloud drive connection failure details for configured providers.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMemo, useState } from 'react'
import type { CloudDriveFile, CloudDriveProvider } from '../../lib/cloudDrive'
import { CLOUD_DRIVE_LABELS } from '../../lib/cloudDrive'

type Props = {
  provider: CloudDriveProvider | null
  message?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  files: CloudDriveFile[]
  loading: boolean
  onImport: (fileIds: string[]) => Promise<void>
}

/** Shown when an otherwise supported cloud drive connection fails. */
export function ConnectDriveModal({ provider, message, open, onOpenChange, files, loading, onImport }: Props) {
  const label = provider ? CLOUD_DRIVE_LABELS[provider] : 'Cloud drive'
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const visible = useMemo(() => files.filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase())), [files, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select files from {label}</DialogTitle>
          <DialogDescription style={{ color: 'hsl(var(--foreground-muted))' }}>
            {message ?? 'Selected files are copied into private workspace storage so later credential revocation cannot remove local records.'}
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Search Google Drive files" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-72 space-y-1 overflow-auto" role="listbox" aria-label="Google Drive files" aria-multiselectable="true">
          {visible.map((file) => <label className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-muted" key={file.id}>
            <input type="checkbox" checked={selected.has(file.id)} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(file.id)) next.delete(file.id); else next.add(file.id); return next })} />
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
            <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{file.size ? `${Math.ceil(file.size / 1024)} KB` : ''}</span>
          </label>)}
          {!loading && visible.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No selectable files.</p> : null}
          {loading ? <p className="py-8 text-center text-sm" aria-live="polite">Loading Drive files…</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading || selected.size === 0} onClick={() => void onImport([...selected])}>Import selected</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
