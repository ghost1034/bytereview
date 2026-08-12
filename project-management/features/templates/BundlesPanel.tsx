'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { useBundlesStore } from '../../stores/entities'

export function BundlesPanel({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const bundles = useBundlesStore((state) => state.list().filter((bundle) => bundle.workspaceId === workspaceId))
  const add = useBundlesStore((state) => state.add)
  const update = useBundlesStore((state) => state.update)
  const remove = useBundlesStore((state) => state.remove)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🧰')
  const [sections, setSections] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const create = async () => {
    if (!name.trim()) return
    const patch = { name: name.trim(), iconEmoji: icon || '🧰', sectionNames: sections.split(',').map((item) => item.trim()).filter(Boolean) }
    if (editingId) await update(editingId, patch)
    else await add({ id: newId(), workspaceId, ...patch, customFieldIds: [], taskTemplates: [], ruleTemplates: [], appliedToProjectIds: [], createdBy: userId, createdAt: now() })
    setName(''); setSections(''); setIcon('🧰'); setEditingId(null)
  }
  return <div className="space-y-4">
    <div className="grid gap-2 rounded-xl border p-4 sm:grid-cols-[80px_1fr_1fr_auto]" style={{ borderColor: 'var(--border-subtle)' }}>
      <Input aria-label="Bundle icon" value={icon} maxLength={8} onChange={(event) => setIcon(event.target.value)} />
      <Input aria-label="Bundle name" value={name} placeholder="Bundle name" onChange={(event) => setName(event.target.value)} />
      <Input aria-label="Bundle sections" value={sections} placeholder="Sections, comma-separated" onChange={(event) => setSections(event.target.value)} />
      <Button onClick={() => void create()} disabled={!name.trim()}>{editingId ? 'Save bundle' : 'Create bundle'}</Button>
    </div>
    <ul className="space-y-2">{bundles.map((bundle) => <li key={bundle.id} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}><div><p className="font-medium">{bundle.iconEmoji} {bundle.name}</p><p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{bundle.sectionNames.length} sections · applied to {bundle.appliedToProjectIds.length} projects</p></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditingId(bundle.id); setName(bundle.name); setIcon(bundle.iconEmoji ?? '🧰'); setSections(bundle.sectionNames.join(', ')) }}>Edit</Button><Button variant="ghost" size="sm" onClick={() => void remove(bundle.id)}>Delete</Button></div></li>)}</ul>
  </div>
}
