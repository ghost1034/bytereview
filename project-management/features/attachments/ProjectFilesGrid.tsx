'use client'

/**
 * ProjectFilesGrid — aggregates attachments across project tasks with filters.
 */
import { useEffect, useMemo, useState } from 'react'
import { Download, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { tasklyticToast } from '../ui/tasklyticToast'
import { getFileStorageAdapter } from '../../lib/fileStorage'
import { now } from '../../lib/time'
import { useAttachmentsStore, useTasksStore } from '../../stores/entities'
import type { Attachment, ID } from '../../types'
import { AttachmentPreviewModal } from './AttachmentPreviewModal'
import {
  MIME_CATEGORY_LABELS,
  downloadNamedFile,
  formatFileSize,
  isImageAttachment,
  mimeCategory,
  type MimeCategory,
} from './attachmentUtils'

type Props = { projectId: ID }

type Row = Attachment & { taskName: string }

/** Grid of all task attachments in a project with type filter and bulk zip. */
export function ProjectFilesGrid({ projectId }: Props) {
  const tasks = useTasksStore((s) => s.list().filter((t) => t.projectIds.includes(projectId)))
  const allAttachments = useAttachmentsStore((s) => s.list())
  const removeAttachment = useAttachmentsStore((s) => s.remove)
  const updateTask = useTasksStore((s) => s.update)
  const storage = getFileStorageAdapter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<MimeCategory | 'all'>('all')
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!preview) {
      setPreviewUrl(null)
      return
    }
    if (preview.dataUrl) {
      setPreviewUrl(preview.dataUrl)
      return
    }
    void storage.getUrl(preview).then((url) => {
      if (!cancelled) setPreviewUrl(url)
    }).catch(() => {
      if (!cancelled) setPreviewUrl(null)
    })
    return () => { cancelled = true }
  }, [preview, storage])

  const rows: Row[] = useMemo(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, t.name]))
    return allAttachments
      .filter((a) => a.taskId && taskMap.has(a.taskId))
      .map((a) => ({ ...a, taskName: taskMap.get(a.taskId!) ?? 'Task' }))
      .filter((a) => {
        if (category !== 'all' && mimeCategory(a.mime) !== category) return false
        if (query.trim() && !a.name.toLowerCase().includes(query.trim().toLowerCase())) return false
        return true
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [allAttachments, category, query, tasks])

  const toggle = (id: ID) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDownload = async () => {
    const picked = rows.filter((r) => selected.has(r.id) && r.storageRef)
    if (!picked.length) {
      tasklyticToast('Nothing to download', { description: 'Select files with stored content.', status: 'info' })
      return
    }
    try {
      const blob = await storage.zipMany(
        picked.map((p) => p.storageRef!),
        picked.map((p) => p.name),
      )
      downloadNamedFile(URL.createObjectURL(blob), `project-${projectId}-files.zip`)
    } catch (err) {
      tasklyticToast('Zip failed', {
        description: err instanceof Error ? err.message : 'Could not create zip',
        status: 'error',
      })
    }
  }

  const bulkDelete = async () => {
    for (const row of rows.filter((r) => selected.has(r.id))) {
      if (row.storageRef) await storage.remove(row.storageRef)
      await removeAttachment(row.id)
      if (row.taskId) {
        const task = tasks.find((t) => t.id === row.taskId)
        if (task) {
          await updateTask(task.id, {
            attachmentIds: task.attachmentIds.filter((id) => id !== row.id),
            modifiedAt: now(),
          })
        }
      }
    }
    setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="tl-input h-9 pl-8 text-sm"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as MimeCategory | 'all')}>
          <SelectTrigger className="tl-input h-9 w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((key) => (
              <SelectItem key={key} value={key}>
                {MIME_CATEGORY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.size > 0 ? (
          <>
            <Button size="sm" variant="outline" className="h-9" onClick={() => void bulkDownload()}>
              <Download className="mr-1 h-4 w-4" /> Download ({selected.size})
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-destructive" onClick={() => void bulkDelete()}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
          No files match your filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border p-2"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              <label className="mb-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                Select
              </label>
              <button type="button" className="w-full text-left" onClick={() => setPreview(row)}>
                {row.dataUrl && isImageAttachment(row) ? (
                  <img src={row.dataUrl} alt="" className="mb-2 h-24 w-full rounded object-cover" />
                ) : (
                  <div
                    className="mb-2 flex h-24 items-center justify-center rounded text-xs"
                    style={{ background: 'var(--bg-muted)', color: 'var(--ink-faint)' }}
                  >
                    {MIME_CATEGORY_LABELS[mimeCategory(row.mime)]}
                  </div>
                )}
                <p className="truncate text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  {row.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {formatFileSize(row.size)} · {row.taskName}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}
      <AttachmentPreviewModal
        attachment={preview}
        url={previewUrl ?? preview?.dataUrl ?? null}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      />
    </div>
  )
}
