import { beforeEach, describe, expect, it } from 'vitest'
import { useTimerStore, type RunningTimer } from './timerStore'

const timer = (userId: string, taskId: string): RunningTimer => ({
  workspaceId: 'workspace-1',
  userId,
  taskId,
  startedAt: '2026-08-12T10:00:00.000Z',
  description: taskId,
  billable: true,
})

describe('user-scoped timer store', () => {
  beforeEach(() => useTimerStore.setState({ runningByUser: {} }))

  it('allows exactly one running timer per user without leaking between users', () => {
    useTimerStore.getState().start(timer('user-a', 'task-1'))
    useTimerStore.getState().start(timer('user-b', 'task-2'))
    useTimerStore.getState().start(timer('user-a', 'task-3'))

    expect(useTimerStore.getState().runningByUser['user-a']?.taskId).toBe('task-3')
    expect(useTimerStore.getState().runningByUser['user-b']?.taskId).toBe('task-2')
  })

  it('stops and discards only the selected user timer', () => {
    useTimerStore.getState().start(timer('user-a', 'task-1'))
    useTimerStore.getState().start(timer('user-b', 'task-2'))

    expect(useTimerStore.getState().stop('user-a')?.taskId).toBe('task-1')
    expect(useTimerStore.getState().runningByUser['user-a']).toBeUndefined()
    expect(useTimerStore.getState().runningByUser['user-b']?.taskId).toBe('task-2')
  })
})
