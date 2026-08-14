'use client'

import { useMemo, useState } from 'react'
import { format, isAfter, isBefore, parseISO } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Project, StatusUpdate } from '../../types'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { STATUS_LABELS } from '../projects/projectUtils'
import { StatusUpdateCard } from './StatusUpdateCard'

type Props = {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Filterable timeline of all status updates for a project (or scope-compatible list). */
export function StatusHistory({ project, open, onOpenChange }: Props) {
  const allUpdates = useStatusUpdatesStore((s) =>
    s
      .list()
      .filter((u) => u.scope.type === 'project' && u.scope.id === project.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const users = useUsersStore((s) => s.list())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [authorFilter, setAuthorFilter] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filtered = useMemo(() => {
    return allUpdates.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (authorFilter !== 'all' && u.authorId !== authorFilter) return false
      const created = parseISO(u.createdAt)
      if (fromDate && isBefore(created, parseISO(fromDate))) return false
      if (toDate && isAfter(created, parseISO(`${toDate}T23:59:59`))) return false
      return true
    })
  }, [allUpdates, authorFilter, fromDate, statusFilter, toDate])

  const authorIds = useMemo(
    () => [...new Set(allUpdates.map((u) => u.authorId))],
    [allUpdates]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans">Status update history</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as StatusUpdate['status'][]).map((key) => (
                  <SelectItem key={key} value={key}>{STATUS_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Author</Label>
            <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="all">All authors</SelectItem>
                {authorIds.map((id) => {
                  const user = users.find((u) => u.id === id)
                  return <SelectItem key={id} value={id}>{user?.name ?? id}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" className="tl-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" className="tl-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filtered.length ? (
            filtered.map((update) => (
              <div key={update.id} id={`status-update-${update.id}`}>
                <StatusUpdateCard
                  update={update}
                  author={users.find((u) => u.id === update.authorId)}
                />
                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {format(parseISO(update.createdAt), 'PPpp')}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No updates match these filters.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
