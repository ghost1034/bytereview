import { useUiStore } from '../../stores/auth'
import { tasklyticApiJson } from '../tasklyticApi'
import type { AnalyticsAdapter, AnalyticsEvent, AnalyticsProperties } from './types'

function emit(event: AnalyticsEvent | string, properties: AnalyticsProperties = {}) {
  const workspaceId = typeof properties.workspaceId === 'string'
    ? properties.workspaceId
    : useUiStore.getState().activeWorkspaceId
  if (!workspaceId) return
  void tasklyticApiJson('/events/usage', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, event, properties }),
  }).catch(() => {
    // Usage telemetry never blocks a user's domain action.
  })
}

export const serverAnalyticsAdapter: AnalyticsAdapter = {
  capabilities: { provider: 'first_party' },
  track: emit,
  identify(userId, traits) {
    emit('user_identified', { userId, ...(traits ?? {}) })
  },
  page(name, properties) {
    emit('page_viewed', { page: name, ...(properties ?? {}) })
  },
}
