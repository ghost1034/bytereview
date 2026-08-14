'use client'

/** PortfolioProjectsToolbar — search, filters, and bulk actions for projects tab. */
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProjectStatus, User } from '../../types'

type Props = {
  search: string
  onSearch: (v: string) => void
  statusFilter: string
  onStatusFilter: (v: string) => void
  ownerFilter: string
  onOwnerFilter: (v: string) => void
  users: User[]
  selectedCount: number
  onBulkStatus: (status: ProjectStatus) => void
  onBulkRemove: () => void
}

export function PortfolioProjectsToolbar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  ownerFilter,
  onOwnerFilter,
  users,
  selectedCount,
  onBulkStatus,
  onBulkRemove,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="rounded-md border border-input bg-background text-foreground max-w-xs" placeholder="Search projects…" value={search} onChange={(e) => onSearch(e.target.value)} />
      <Select value={statusFilter} onValueChange={onStatusFilter}>
        <SelectTrigger className="rounded-md border border-input bg-background text-foreground w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="on_track">On track</SelectItem>
          <SelectItem value="at_risk">At risk</SelectItem>
          <SelectItem value="off_track">Off track</SelectItem>
          <SelectItem value="on_hold">On hold</SelectItem>
          <SelectItem value="complete">Complete</SelectItem>
        </SelectContent>
      </Select>
      <Select value={ownerFilter} onValueChange={onOwnerFilter}>
        <SelectTrigger className="rounded-md border border-input bg-background text-foreground w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="all">All owners</SelectItem>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => onBulkStatus('on_track')}>Set on track</Button>
          <Button size="sm" variant="outline" onClick={() => onBulkStatus('at_risk')}>Set at risk</Button>
          <Button size="sm" variant="outline" onClick={onBulkRemove}>Remove</Button>
        </div>
      )}
    </div>
  )
}
