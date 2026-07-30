'use client'

/**
 * Column layout store — persists order, width, and visibility per user × project.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BuiltinColumnId =
  | 'name'
  | 'assignee'
  | 'dueOn'
  | 'priority'
  | 'status'
  | 'tags'
  | 'projects'

export type ListColumnId = BuiltinColumnId | string

export type ColumnDef = {
  id: ListColumnId
  label: string
  width: number
  visible: boolean
  customFieldId?: string
}

export const CUSTOM_FIELD_COLUMN_PREFIX = 'cf:'

export const LIST_SELECT_COLUMN_WIDTH = 36
export const LIST_COMPLETE_COLUMN_WIDTH = 72
export const LIST_NAME_MIN_WIDTH = 160
export const LIST_NAME_MAX_WIDTH = 260

export function customFieldColumnId(fieldId: string): string {
  return `${CUSTOM_FIELD_COLUMN_PREFIX}${fieldId}`
}

export function parseCustomFieldColumnId(id: string): string | null {
  return id.startsWith(CUSTOM_FIELD_COLUMN_PREFIX)
    ? id.slice(CUSTOM_FIELD_COLUMN_PREFIX.length)
    : null
}

export const DEFAULT_LIST_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Task name', width: 220, visible: true },
  { id: 'assignee', label: 'Assignee', width: 140, visible: true },
  { id: 'dueOn', label: 'Due date', width: 120, visible: true },
  { id: 'priority', label: 'Priority', width: 100, visible: false },
  { id: 'status', label: 'Status', width: 100, visible: false },
  { id: 'tags', label: 'Tags', width: 120, visible: false },
  { id: 'projects', label: 'Projects', width: 140, visible: false },
]

/** Stable fallback for selectors — must not be mutated in place. */
export const DEFAULT_COLUMNS_SNAPSHOT: ColumnDef[] = DEFAULT_LIST_COLUMNS.map((c) => ({ ...c }))

export function columnsStorageKey(userId: string | null, projectId: string) {
  return `${userId ?? 'anon'}:${projectId}`
}

function storageKey(userId: string, projectId: string) {
  return columnsStorageKey(userId, projectId)
}

type ColumnsState = {
  byKey: Record<string, ColumnDef[]>
  getColumns: (userId: string | null, projectId: string) => ColumnDef[]
  setColumns: (userId: string | null, projectId: string, columns: ColumnDef[]) => void
  toggleVisibility: (userId: string | null, projectId: string, columnId: ListColumnId) => void
  setWidth: (userId: string | null, projectId: string, columnId: ListColumnId, width: number) => void
  reorder: (userId: string | null, projectId: string, fromIndex: number, toIndex: number) => void
  reset: (userId: string | null, projectId: string) => void
}

export const useColumnsStore = create<ColumnsState>()(
  persist(
    (set, get) => ({
      byKey: {},

      getColumns(userId, projectId) {
        const key = storageKey(userId ?? 'anon', projectId)
        return get().byKey[key] ?? DEFAULT_COLUMNS_SNAPSHOT
      },

      setColumns(userId, projectId, columns) {
        const key = storageKey(userId ?? 'anon', projectId)
        set((s) => ({ byKey: { ...s.byKey, [key]: columns } }))
      },

      toggleVisibility(userId, projectId, columnId) {
        const key = storageKey(userId ?? 'anon', projectId)
        const current = get().getColumns(userId, projectId)
        const next = current.map((c) =>
          c.id === columnId ? { ...c, visible: c.id === 'name' ? true : !c.visible } : c
        )
        set((s) => ({ byKey: { ...s.byKey, [key]: next } }))
      },

      setWidth(userId, projectId, columnId, width) {
        const key = storageKey(userId ?? 'anon', projectId)
        const current = get().getColumns(userId, projectId)
        const next = current.map((c) => {
          if (c.id !== columnId) return c
          if (columnId === 'name') {
            return {
              ...c,
              width: Math.min(Math.max(width, LIST_NAME_MIN_WIDTH), LIST_NAME_MAX_WIDTH),
            }
          }
          return { ...c, width: Math.max(80, width) }
        })
        set((s) => ({ byKey: { ...s.byKey, [key]: next } }))
      },

      reorder(userId, projectId, fromIndex, toIndex) {
        const key = storageKey(userId ?? 'anon', projectId)
        const current = [...get().getColumns(userId, projectId)]
        const [moved] = current.splice(fromIndex, 1)
        if (!moved) return
        current.splice(toIndex, 0, moved)
        set((s) => ({ byKey: { ...s.byKey, [key]: current } }))
      },

      reset(userId, projectId) {
        const key = storageKey(userId ?? 'anon', projectId)
        set((s) => ({
          byKey: { ...s.byKey, [key]: DEFAULT_LIST_COLUMNS.map((c) => ({ ...c })) },
        }))
      },
    }),
    { name: 'tasklytic:columns' }
  )
)

/** Merge custom field columns into the saved layout for a project (order follows project fields). */
export function syncCustomFieldColumns(
  userId: string | null,
  projectId: string,
  fields: { id: string; name: string; type?: string }[]
): void {
  const store = useColumnsStore.getState()
  const current = store.getColumns(userId, projectId)
  const builtIn = current.filter((c) => !parseCustomFieldColumnId(String(c.id)))
  const existing = new Map(
    current
      .map((c) => {
        const fieldId = parseCustomFieldColumnId(String(c.id))
        return fieldId ? ([fieldId, c] as const) : null
      })
      .filter((x): x is [string, ColumnDef] => Boolean(x))
  )
  const cfColumns: ColumnDef[] = fields.map((f) => {
    const prev = existing.get(f.id)
    return (
      prev ?? {
        id: customFieldColumnId(f.id),
        label: f.name,
        width: 120,
        visible: f.name === 'Priority' || f.name === 'Status',
        customFieldId: f.id,
      }
    )
  })
  const next = [...builtIn, ...cfColumns]
  const prevJson = JSON.stringify(current)
  const nextJson = JSON.stringify(next)
  if (prevJson !== nextJson) store.setColumns(userId, projectId, next)
}

/** Lookup a custom field column definition for list headers. */
export function getCustomFieldColumn(
  userId: string | null,
  projectId: string,
  fieldId: string
): ColumnDef | undefined {
  return useColumnsStore
    .getState()
    .getColumns(userId, projectId)
    .find((c) => c.customFieldId === fieldId || c.id === customFieldColumnId(fieldId))
}

/** Build a CSS grid template: select, complete, then visible data columns. */
export function columnGridTemplate(columns: ColumnDef[]): string {
  const visible = columns.filter((c) => c.visible)
  const parts = [
    `${LIST_SELECT_COLUMN_WIDTH}px`,
    `${LIST_COMPLETE_COLUMN_WIDTH}px`,
    ...visible.map((c) => `${c.width}px`),
  ]
  const nameCol = visible.find((c) => c.id === 'name')
  if (nameCol) {
    const idx = visible.indexOf(nameCol) + 2
    const maxW = Math.min(Math.max(nameCol.width, LIST_NAME_MIN_WIDTH), LIST_NAME_MAX_WIDTH)
    parts[idx] = `minmax(${LIST_NAME_MIN_WIDTH}px, ${maxW}px)`
  }
  return parts.join(' ')
}

/** Minimum scroll width so fixed + data columns stay readable. */
export function columnGridMinWidth(columns: ColumnDef[]): number {
  const visible = columns.filter((c) => c.visible)
  const nameCol = visible.find((c) => c.id === 'name')
  const nameW = nameCol
    ? Math.min(Math.max(nameCol.width, LIST_NAME_MIN_WIDTH), LIST_NAME_MAX_WIDTH)
    : 0
  const dataW = visible.reduce((sum, c) => sum + (c.id === 'name' ? nameW : c.width), 0)
  return LIST_SELECT_COLUMN_WIDTH + LIST_COMPLETE_COLUMN_WIDTH + dataW
}
