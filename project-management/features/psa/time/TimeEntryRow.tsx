'use client'

/** Single time entry row for lists and task tab. */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { TIME_ENTRY_STATUS_LABELS } from '../../../lib/psa/constants'
import { entryHours, formatHoursHMM } from '../../../lib/psa/timeEntryUtils'
import type { TimeEntry } from '../../../types'

type Props = {
  entry: TimeEntry
  onSubmit?: (id: string) => void
  onDelete?: (id: string) => void
  onEdit?: (entry: TimeEntry) => void
  onDuplicate?: (entry: TimeEntry) => void
  onWriteOff?: (entry: TimeEntry) => void
}

export function TimeEntryRow({ entry, onSubmit, onDelete, onEdit, onDuplicate, onWriteOff }: Props) {
  const status = entry.status ?? 'draft'
  return (
    <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <td className="px-3 py-2 font-mono tabular-nums text-sm">{entry.date}</td>
      <td className="px-3 py-2 text-sm">{entry.description}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-sm">{formatHoursHMM(entryHours(entry))}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-sm">{entry.rateSnapshot != null ? formatMoney(entry.rateSnapshot) : '—'}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-sm">{formatMoney(entry.amount ?? 0)}</td>
      <td className="px-3 py-2"><Badge variant={entry.billable ? 'default' : 'secondary'}>{entry.billable ? 'Billable' : 'Non-bill'}</Badge></td>
      <td className="px-3 py-2"><Badge variant="outline">{TIME_ENTRY_STATUS_LABELS[status] ?? status}</Badge></td>
      <td className="px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent className="tl-popover-surface" align="end">
            {(status === 'draft' || status === 'rejected') && onEdit && <DropdownMenuItem onClick={() => onEdit(entry)}>Edit</DropdownMenuItem>}
            {status === 'draft' && onSubmit && <DropdownMenuItem onClick={() => onSubmit(entry.id)}>Submit</DropdownMenuItem>}
            {onDuplicate && <DropdownMenuItem onClick={() => onDuplicate(entry)}>Duplicate</DropdownMenuItem>}
            {status === 'approved' && onWriteOff && <DropdownMenuItem onClick={() => onWriteOff(entry)}>Write off</DropdownMenuItem>}
            {status === 'draft' && onDelete && <DropdownMenuItem onClick={() => onDelete(entry.id)}>Delete</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
