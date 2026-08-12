import { describe, expect, it, vi } from 'vitest'

vi.mock('./tasklyticApi', () => ({ tasklyticEventFetch: vi.fn() }))
import {
  connectWorkspaceEventStream,
  parseSseBlock,
  workspaceEventPath,
} from './workspaceEvents'

function responseFor(id: number) {
  const payload = {
    id,
    workspaceId: 'w1',
    entity: 'tasks',
    recordId: 't1',
    operation: 'updated',
    revision: id,
  }
  return new Response(
    `id: ${id}\nevent: workspace-change\ndata: ${JSON.stringify(payload)}\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

describe('workspace event stream', () => {
  it('parses SSE records and ignores keep-alives', () => {
    expect(parseSseBlock(': keep-alive 2')).toBeNull()
    expect(parseSseBlock(
      'id: 2\nevent: workspace-change\ndata: {"workspaceId":"w1","entity":"tasks","recordId":"t1","operation":"updated","revision":2}',
    )).toMatchObject({ id: 2, workspaceId: 'w1', revision: 2 })
  })

  it('reconnects with the last durable cursor and suppresses replayed ids', async () => {
    const paths: string[] = []
    const received: number[] = []
    let call = 0
    let disconnect = () => {}
    const done = new Promise<void>((resolve) => {
      disconnect = connectWorkspaceEventStream(
        'w1',
        (event) => {
          received.push(event.id)
          if (received.length === 2) {
            disconnect()
            resolve()
          }
        },
        {
          retryMs: 0,
          fetcher: async (path) => {
            paths.push(path)
            call += 1
            return responseFor(call === 1 ? 4 : 5)
          },
        },
      )
    })
    await done
    expect(received).toEqual([4, 5])
    expect(paths.slice(0, 2)).toEqual([
      workspaceEventPath('w1', 0),
      workspaceEventPath('w1', 4),
    ])
  })
})
