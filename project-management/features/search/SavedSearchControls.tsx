'use client'

import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { newId } from '../../lib/ids'
import { migrateViewQuery, type ViewQuery } from '../../lib/query'
import { useSavedViewsStore } from '../../stores/entities'
import type { SavedView } from '../../types'

export function SavedSearchControls({ workspaceId, userId, query, viewType }: { workspaceId: string; userId: string; query: ViewQuery; viewType: 'list' | 'board' | 'chart' }) {
  const add = useSavedViewsStore((state) => state.add)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ownership, setOwnership] = useState<'personal' | 'workspace'>('personal')
  const save = async () => {
    if (!name.trim()) return
    const normalized = migrateViewQuery(query)
    const saved: SavedView = {
      id: newId(), ownerScope: { type: 'search', id: workspaceId }, name: name.trim(), viewType,
      filters: [], filterExpression: normalized.filterExpression, query: normalized,
      scope: { type: 'workspace', id: workspaceId }, ownership, pinned: ownership === 'personal',
      hiddenFields: normalized.hiddenFields, groupBy: normalized.groupBy, sortBy: normalized.sortBy, createdBy: userId,
    }
    await add(saved)
    setName('')
    setOpen(false)
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><BookmarkPlus className="mr-1 h-4 w-4" />Save search</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>Save search</DialogTitle></DialogHeader>
      <Input aria-label="Saved search name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Search name" />
      <Select value={ownership} onValueChange={(value) => setOwnership(value as 'personal' | 'workspace')}>
        <SelectTrigger aria-label="Saved search ownership"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="personal">Personal</SelectItem><SelectItem value="workspace">Workspace</SelectItem></SelectContent>
      </Select>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={!name.trim()}>Save</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
