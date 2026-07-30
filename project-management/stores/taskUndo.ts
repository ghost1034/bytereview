'use client'

/**
 * Task undo stack — reverses up to the last 10 task mutations in List/Board views.
 */
import { create } from 'zustand'
import { tasklyticToast } from '../features/ui/tasklyticToast'

export type TaskUndoEntry = {
  id: string
  label: string
  revert: () => Promise<void>
}

const MAX_UNDO = 10
let idSeq = 0

type TaskUndoState = {
  stack: TaskUndoEntry[]
  push: (entry: Omit<TaskUndoEntry, 'id'>, toast?: { title: string; description?: string }) => void
  undoLast: () => Promise<boolean>
  clear: () => void
}

export const useTaskUndoStore = create<TaskUndoState>((set, get) => ({
  stack: [],

  push(entry, toast) {
    const next: TaskUndoEntry = { ...entry, id: `undo-${++idSeq}` }
    set((s) => {
      const stack = [...s.stack, next]
      if (stack.length > MAX_UNDO) stack.shift()
      return { stack }
    })
    if (toast) {
      tasklyticToast(toast.title, {
        status: 'info',
        description: toast.description ?? 'Use Undo in the toolbar to reverse (up to 10 recent actions).',
      })
    }
  },

  async undoLast() {
    const stack = get().stack
    const entry = stack[stack.length - 1]
    if (!entry) {
      tasklyticToast('Nothing to undo', { status: 'info' })
      return false
    }
    try {
      await entry.revert()
      set({ stack: stack.slice(0, -1) })
      tasklyticToast('Undone', { status: 'success', description: entry.label })
      return true
    } catch {
      tasklyticToast('Could not undo', { status: 'error' })
      return false
    }
  },

  clear() {
    set({ stack: [] })
  },
}))

export function pushTaskUndo(
  entry: Omit<TaskUndoEntry, 'id'>,
  toast?: { title: string; description?: string }
): void {
  useTaskUndoStore.getState().push(entry, toast)
}

export const TASK_UNDO_MAX = MAX_UNDO
