'use client'

/**
 * SavedViewsMenu — save, load, rename, delete, and set default project views.
 */
import { useMemo, useState } from 'react'
import { Bookmark, ChevronDown, Pencil, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { ProjectView, SavedView } from '../../types'
import { migrateViewQuery, type ViewQuery } from '../../lib/query/applyQuery'
import { useAuthStore } from '../../stores/auth'
import { useSavedViewsStore } from '../../stores/entities'
import { useViewQueryStore } from '../../stores/viewQuery'
import { newId } from '../../lib/ids'

type Props = {
  projectId: string
  viewType: ProjectView
  query: ViewQuery
  onChange: (query: ViewQuery) => void
}

/** Map a SavedView entity into the shared ViewQuery shape. */
export function savedViewToViewQuery(saved: SavedView, current: ViewQuery): ViewQuery {
  return migrateViewQuery({
    ...current,
    filters: saved.filters as ViewQuery['filters'],
    filterExpression: saved.filterExpression,
    groupBy: (saved.groupBy as ViewQuery['groupBy']) ?? undefined,
    sortBy: saved.sortBy,
    sort: saved.sortBy,
    hiddenFields: saved.hiddenFields ?? [],
    search: current.search,
  })
}

/** Map ViewQuery fields into SavedView-compatible filter/sort/group fields. */
export function viewQueryToSavedFields(query: ViewQuery) {
  return {
    filters: query.filters,
    filterExpression: migrateViewQuery(query).filterExpression,
    groupBy: query.groupBy,
    sortBy: query.sortBy ?? query.sort,
    hiddenFields: query.hiddenFields,
  }
}

export function SavedViewsMenu({ projectId, viewType, query, onChange }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const savedViews = useSavedViewsStore((s) => s.list())
  const addSavedView = useSavedViewsStore((s) => s.add)
  const updateSavedView = useSavedViewsStore((s) => s.update)
  const removeSavedView = useSavedViewsStore((s) => s.remove)
  const defaultId = useViewQueryStore((s) => s.getDefaultSavedViewId(projectId, viewType))
  const setDefaultSavedView = useViewQueryStore((s) => s.setDefaultSavedView)

  const [saveOpen, setSaveOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<SavedView | null>(null)
  const [name, setName] = useState('')

  const projectViews = useMemo(
    () =>
      savedViews
        .filter((v) => v.ownerScope.type === 'project' && v.ownerScope.id === projectId && v.viewType === viewType)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projectId, savedViews, viewType]
  )

  const activeView = projectViews.find((v) => defaultId === v.id)

  const saveView = async () => {
    if (!currentUserId || !name.trim()) return
    const fields = viewQueryToSavedFields(query)
    const view: SavedView = {
      id: newId(),
      ownerScope: { type: 'project', id: projectId },
      name: name.trim(),
      viewType,
      filters: fields.filters,
      filterExpression: fields.filterExpression,
      groupBy: fields.groupBy,
      sortBy: fields.sortBy,
      hiddenFields: fields.hiddenFields,
      createdBy: currentUserId,
    }
    await addSavedView(view)
    setDefaultSavedView(projectId, viewType, view.id)
    setName('')
    setSaveOpen(false)
  }

  const renameView = async () => {
    if (!renameTarget || !name.trim()) return
    await updateSavedView(renameTarget.id, { name: name.trim() })
    setRenameOpen(false)
    setRenameTarget(null)
    setName('')
  }

  const loadView = (view: SavedView) => {
    onChange(savedViewToViewQuery(view, query))
    setDefaultSavedView(projectId, viewType, view.id)
  }

  const openRename = (view: SavedView) => {
    setRenameTarget(view)
    setName(view.name)
    setRenameOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark className="mr-1 h-4 w-4" />
            {activeView?.name ?? 'Saved views'}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Project views</DropdownMenuLabel>
          {projectViews.length ? (
            projectViews.map((view) => (
              <DropdownMenuItem key={view.id} onClick={() => loadView(view)} className="justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {defaultId === view.id ? <Star className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--primary))' }} /> : null}
                  {view.name}
                </span>
                <span className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    className="rounded p-0.5 hover:opacity-80"
                    aria-label={`Rename ${view.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openRename(view)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:opacity-80"
                    aria-label={`Set default ${view.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDefaultSavedView(projectId, viewType, view.id)
                    }}
                  >
                    <Star className="h-3.5 w-3.5" style={{ color: defaultId === view.id ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))' }} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:opacity-80"
                    aria-label={`Delete ${view.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeSavedView(view.id)
                      if (defaultId === view.id) setDefaultSavedView(projectId, viewType, null)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
                  </button>
                </span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>Save current view…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveView()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveView()} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void renameView()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void renameView()} disabled={!name.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
