'use client'

/**
 * ProjectFilesGrid — aggregates attachments across project tasks with filters.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Download, Grid2X2, List, Search, Trash2 } from 'lucide-react'
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
import { useAttachmentsStore, useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { useAuthStore } from '../../stores/auth'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import type { Attachment, ID, Project } from '../../types'
import { AttachmentListPanel } from './AttachmentListPanel'
import { useProjectAttachmentScope } from './useAttachmentScope'
import { AttachmentPreviewModal } from './AttachmentPreviewModal'
import {
  MIME_CATEGORY_LABELS,
  downloadNamedFile,
  formatFileSize,
  isImageAttachment,
  mimeCategory,
  type MimeCategory,
} from './attachmentUtils'

type Props = { project: Project }

type Row = Attachment & { taskName: string; uploaderName: string }
type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc'

/** Grid of all task attachments in a project with type filter and bulk zip. */
export function ProjectFilesGrid({ project }: Props) {
  const projectId = project.id
  const { workspace, workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const tasks = useTasksStore((s) => s.list().filter((t) => t.projectIds.includes(projectId)))
  const allAttachments = useAttachmentsStore((s) => s.list())
  const removeAttachment = useAttachmentsStore((s) => s.remove)
  const updateTask = useTasksStore((s) => s.update)
  const updateProject = useProjectsStore((s) => s.update)
  const projectAttachmentScope = useProjectAttachmentScope(project)
  const storage = getFileStorageAdapter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<MimeCategory | 'all'>('all')
  const [uploaderId, setUploaderId] = useState('all')
  const [sort, setSort] = useState<SortKey>('date_desc')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const canDelete = canPerformWorkspaceAction(
    users.find((user) => user.id === currentUserId),
    workspace,
    'edit'
  )

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
      .filter((a) => (a.taskId && taskMap.has(a.taskId)) || a.projectId === projectId)
      .map((a) => ({
        ...a,
        taskName: a.taskId ? taskMap.get(a.taskId) ?? 'Task' : 'Project',
        uploaderName: users.find((user) => user.id === a.uploadedBy)?.name ?? 'Unknown',
      }))
      .filter((a) => {
        if (category !== 'all' && mimeCategory(a.mime) !== category) return false
        if (uploaderId !== 'all' && a.uploadedBy !== uploaderId) return false
        const needle = query.trim().toLowerCase()
        if (needle && !`${a.name} ${a.taskName} ${a.uploaderName}`.toLowerCase().includes(needle)) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'date_asc') return a.createdAt.localeCompare(b.createdAt)
        if (sort === 'name_asc') return a.name.localeCompare(b.name)
        if (sort === 'name_desc') return b.name.localeCompare(a.name)
        if (sort === 'size_asc') return a.size - b.size
        if (sort === 'size_desc') return b.size - a.size
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [allAttachments, category, projectId, query, sort, tasks, uploaderId, users])

  const uploaders = useMemo(
    () => users.filter((user) => rows.some((row) => row.uploadedBy === user.id)),
    [rows, users]
  )

  const toggle = (id: ID) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDownload = async () => {
    const picked = rows.filter((r) => selected.has(r.id) && r.storageRef).slice(0, 100)
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
    if (!canDelete) {
      tasklyticToast('Deletion not allowed', { description: 'You need project edit access to delete files.', status: 'error' })
      return
    }
    if (!window.confirm(`Delete ${selected.size} selected file${selected.size === 1 ? '' : 's'}?`)) return
    const deleting = rows.filter((r) => selected.has(r.id))
    const deletingIds = new Set(deleting.map((row) => row.id))
    for (const row of deleting) {
      if (row.storageRef) await storage.remove(row.storageRef)
      await removeAttachment(row.id)
    }
    for (const task of tasks.filter((row) => row.attachmentIds.some((id) => deletingIds.has(id)))) {
      await updateTask(task.id, {
        attachmentIds: task.attachmentIds.filter((id) => !deletingIds.has(id)),
        coverAttachmentId: task.coverAttachmentId && deletingIds.has(task.coverAttachmentId) ? undefined : task.coverAttachmentId,
        modifiedAt: now(),
      })
    }
    if (project && (project.attachmentIds ?? []).some((id) => deletingIds.has(id))) {
      await updateProject(projectId, {
        attachmentIds: (project.attachmentIds ?? []).filter((id) => !deletingIds.has(id)),
        modifiedAt: now(),
      })
    }
    setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      {canDelete ? <AttachmentListPanel scope={projectAttachmentScope} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4" style={{ color: 'hsl(var(--foreground-subtle))' }} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="tl-input h-9 pl-8 text-sm"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as MimeCategory | 'all')}>
          <SelectTrigger className="tl-input h-9 w-40" aria-label="File type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(MIME_CATEGORY_LABELS) as MimeCategory[]).map((key) => (
              <SelectItem key={key} value={key}>
                {MIME_CATEGORY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={uploaderId} onValueChange={setUploaderId}>
          <SelectTrigger className="tl-input h-9 w-40" aria-label="Uploader"><SelectValue placeholder="Uploader" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All uploaders</SelectItem>
            {uploaders.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger className="tl-input h-9 w-40" aria-label="Sort files"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
            <SelectItem value="size_desc">Largest first</SelectItem>
            <SelectItem value="size_asc">Smallest first</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
          <Button size="icon" variant={layout === 'grid' ? 'secondary' : 'ghost'} className="h-9 w-9" aria-label="Grid layout" onClick={() => setLayout('grid')}><Grid2X2 className="h-4 w-4" /></Button>
          <Button size="icon" variant={layout === 'list' ? 'secondary' : 'ghost'} className="h-9 w-9" aria-label="List layout" onClick={() => setLayout('list')}><List className="h-4 w-4" /></Button>
        </div>
        {rows.length > 0 ? (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)))}>
            {selected.size === rows.length ? 'Clear selection' : 'Select all'}
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <>
            <Button size="sm" variant="outline" className="h-9" onClick={() => void bulkDownload()}>
              <Download className="mr-1 h-4 w-4" /> Download ({selected.size})
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-destructive" disabled={!canDelete} onClick={() => void bulkDelete()}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          No files match your filters.
        </p>
      ) : (
        layout === 'grid' ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border p-2"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
            >
              <label className="mb-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                Select
              </label>
              <button type="button" className="w-full text-left" onClick={() => setPreview(row)}>
                {row.dataUrl && isImageAttachment(row) ? (
                  <Image unoptimized src={row.dataUrl} alt="" width={240} height={96} className="mb-2 h-24 w-full rounded object-cover" />
                ) : (
                  <div
                    className="mb-2 flex h-24 items-center justify-center rounded text-xs"
                    style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-subtle))' }}
                  >
                    {MIME_CATEGORY_LABELS[mimeCategory(row.mime)]}
                  </div>
                )}
                <p className="truncate text-sm font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {row.name}
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>
                  {formatFileSize(row.size)} · {row.taskName} · {row.uploaderName}
                </p>
              </button>
            </div>
          ))}
        </div> : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}>
                <tr>
                  <th className="p-2"><span className="sr-only">Select</span></th>
                  <th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Size</th>
                  <th className="p-2">Uploaded by</th><th className="p-2">Uploaded</th><th className="p-2">Task</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <td className="p-2"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} /></td>
                    <td className="p-2"><button type="button" className="font-medium hover:underline" onClick={() => setPreview(row)}>{row.name}</button></td>
                    <td className="p-2">{MIME_CATEGORY_LABELS[mimeCategory(row.mime)]}</td>
                    <td className="p-2">{formatFileSize(row.size)}</td><td className="p-2">{row.uploaderName}</td>
                    <td className="p-2">{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td className="p-2">{row.taskId && workspaceId ? <Link className="hover:underline" href={`/dashboard/project-management/w/${workspaceId}/tasks/${row.taskId}`}>{row.taskName}</Link> : row.taskName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
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
