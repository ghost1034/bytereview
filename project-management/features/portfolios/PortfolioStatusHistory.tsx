'use client'

/** PortfolioStatusHistory — filterable portfolio status update timeline. */
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
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
import { Label } from '@/components/ui/label'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { STATUS_LABELS } from '../projects/projectUtils'
import { StatusUpdateCard } from '../status/StatusUpdateCard'
import type { StatusUpdate } from '../../types'

type Props = {
  portfolioId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PortfolioStatusHistory({ portfolioId, open, onOpenChange }: Props) {
  const allUpdates = useStatusUpdatesStore((s) =>
    s.list()
      .filter((u) => u.scope.type === 'portfolio' && u.scope.id === portfolioId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const users = useUsersStore((s) => s.list())
  const [statusFilter, setStatusFilter] = useState('all')
  const [authorFilter, setAuthorFilter] = useState('all')

  const filtered = useMemo(() => {
    return allUpdates.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (authorFilter !== 'all' && u.authorId !== authorFilter) return false
      return true
    })
  }, [allUpdates, authorFilter, statusFilter])

  const authorIds = useMemo(() => [...new Set(allUpdates.map((u) => u.authorId))], [allUpdates])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif">Portfolio status history</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
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
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="all">All authors</SelectItem>
                {authorIds.map((id) => {
                  const user = users.find((u) => u.id === id)
                  return <SelectItem key={id} value={id}>{user?.name ?? id}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {filtered.length ? filtered.map((update) => (
            <div key={update.id} id={`status-update-${update.id}`}>
              <StatusUpdateCard update={update} author={users.find((u) => u.id === update.authorId)} />
              <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>{format(parseISO(update.createdAt), 'PPpp')}</p>
            </div>
          )) : (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No updates yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
