'use client'

/**
 * MyTasksCustomizeDrawer — reorder, hide, rename, and add personal sections.
 */
import { useState } from 'react'
import { GripVertical, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { addCustomMySection } from './myTasksActions'
import type { BuiltinMyTasksSectionId, MyTasksLayout, MyTasksSectionId } from './types'
import { BUILTIN_SECTION_LABELS, DEFAULT_MY_TASKS_LAYOUT } from './types'
import { isBuiltinSectionId } from './myTasksUtils'

type Props = {
  workspaceId: string
  userId: string
  layout: MyTasksLayout
  onUpdate: (layout: MyTasksLayout) => Promise<void>
}

/** Right-rail customize panel for My Tasks sections. */
export function MyTasksCustomizeDrawer({ workspaceId, userId, layout, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const toggleHidden = (id: MyTasksSectionId) => {
    const hidden = new Set(layout.hiddenSectionIds)
    if (hidden.has(id)) hidden.delete(id)
    else hidden.add(id)
    void onUpdate({ ...layout, hiddenSectionIds: [...hidden] })
  }

  const renameBuiltin = (id: BuiltinMyTasksSectionId, name: string) => {
    void onUpdate({
      ...layout,
      sectionLabels: { ...layout.sectionLabels, [id]: name.trim() || BUILTIN_SECTION_LABELS[id] },
    })
  }

  const renameCustom = (id: string, name: string) => {
    void onUpdate({
      ...layout,
      customSections: layout.customSections.map((s) => (s.id === id ? { ...s, name } : s)),
    })
  }

  const deleteCustom = (id: string) => {
    void onUpdate({
      ...layout,
      customSections: layout.customSections.filter((s) => s.id !== id),
      sectionOrder: layout.sectionOrder.filter((sid) => sid !== id),
      hiddenSectionIds: layout.hiddenSectionIds.filter((sid) => sid !== id),
    })
  }

  const moveSection = (id: MyTasksSectionId, dir: -1 | 1) => {
    const order = [...layout.sectionOrder]
    const idx = order.indexOf(id)
    if (idx === -1) return
    const next = idx + dir
    if (next < 0 || next >= order.length) return
    ;[order[idx], order[next]] = [order[next], order[idx]]
    void onUpdate({ ...layout, sectionOrder: order })
  }

  const addSection = async () => {
    const next = await addCustomMySection(userId, workspaceId, newName || 'New section')
    setNewName('')
    await onUpdate(next)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          Customize
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-sans">Customize My Tasks</SheetTitle>
          <SheetDescription>Reorder sections, add personal buckets, and tune defaults.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="subtasks-toggle" className="text-sm">
              Show subtasks when parent isn&apos;t assigned to me
            </Label>
            <Switch
              id="subtasks-toggle"
              checked={layout.showSubtasksWhenParentUnassigned !== false}
              onCheckedChange={(checked) => void onUpdate({ ...layout, showSubtasksWhenParentUnassigned: checked })}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Sections
            </p>
            <ul className="space-y-2">
              {layout.sectionOrder.map((id) => {
                const builtin = isBuiltinSectionId(id)
                const label = builtin
                  ? layout.sectionLabels?.[id as BuiltinMyTasksSectionId] ?? BUILTIN_SECTION_LABELS[id as BuiltinMyTasksSectionId]
                  : layout.customSections.find((s) => s.id === id)?.name ?? 'Section'
                const hidden = layout.hiddenSectionIds.includes(id)
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    <GripVertical className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--foreground-subtle))' }} />
                    <Input
                      value={label}
                      onChange={(e) =>
                        builtin
                          ? renameBuiltin(id as BuiltinMyTasksSectionId, e.target.value)
                          : renameCustom(id, e.target.value)
                      }
                      className="h-8 flex-1 text-sm"
                    />
                    <Switch checked={!hidden} onCheckedChange={() => toggleHidden(id)} aria-label="Visible" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(id, -1)}>
                      ↑
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(id, 1)}>
                      ↓
                    </Button>
                    {!builtin ? (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCustom(id)}>
                        <Trash2 className="h-4 w-4" style={{ color: 'hsl(var(--destructive))' }} />
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New section name…"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addSection()
              }}
            />
            <Button className="shrink-0 gap-1" onClick={() => void addSection()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={() => void onUpdate({ ...DEFAULT_MY_TASKS_LAYOUT })}>
            Reset to defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
