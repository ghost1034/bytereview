import { setActiveRepositoryWorkspaceId } from './workspaceScope'
import { useUiStore } from '../../stores/auth'

/** Remove all Tasklytic localStorage keys (legacy client-side persistence). */
export function clearTasklyticLocalStorage(): void {
  if (typeof window === 'undefined') return
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith('tasklytic'))
    .forEach((key) => window.localStorage.removeItem(key))
}

/** Drop stale client-side workspace selection after switching to server persistence. */
export function resetTasklyticClientWorkspaceState(): void {
  clearTasklyticLocalStorage()
  useUiStore.getState().setActiveWorkspaceId(null)
  setActiveRepositoryWorkspaceId(null)
}
