import { tasklyticEventFetch } from './tasklyticApi'

export type WorkspaceEvent = {
  id: number
  workspaceId: string
  entity: string
  recordId: string
  operation: 'created' | 'updated' | 'deleted'
  revision: number
}

export function parseSseBlock(block: string): WorkspaceEvent | null {
  let eventName = 'message'
  let id: number | null = null
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') eventName = value
    if (field === 'id' && /^\d+$/.test(value)) id = Number(value)
    if (field === 'data') data.push(value)
  }
  if (eventName !== 'workspace-change' || id === null || data.length === 0) return null
  const parsed = JSON.parse(data.join('\n')) as WorkspaceEvent
  return { ...parsed, id }
}

export function workspaceEventPath(workspaceId: string, cursor: number): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/events?cursor=${cursor}`
}

type StreamDependencies = {
  fetcher?: typeof tasklyticEventFetch
  retryMs?: number
}

/** Bearer-authenticated SSE client with durable cursor reconnects. */
export function connectWorkspaceEventStream(
  workspaceId: string,
  onEvent: (event: WorkspaceEvent) => void,
  dependencies: StreamDependencies = {},
): () => void {
  const controller = new AbortController()
  const fetcher = dependencies.fetcher ?? tasklyticEventFetch
  const retryMs = dependencies.retryMs ?? 1_000
  let cursor = 0
  let carry = ''

  const wait = () => new Promise<void>((resolve) => {
    const timer = globalThis.setTimeout(resolve, retryMs)
    controller.signal.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      resolve()
    }, { once: true })
  })

  async function run() {
    while (!controller.signal.aborted) {
      try {
        const response = await fetcher(workspaceEventPath(workspaceId, cursor), controller.signal)
        if (!response.ok || !response.body) throw new Error(`Workspace event stream failed (${response.status})`)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read()
          carry += decoder.decode(value, { stream: !done })
          const blocks = carry.split(/\r?\n\r?\n/)
          carry = blocks.pop() ?? ''
          for (const block of blocks) {
            const event = parseSseBlock(block)
            if (!event || event.id <= cursor) continue
            cursor = event.id
            onEvent(event)
          }
          if (done) break
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Tasklytic live updates disconnected:', error)
      }
      if (!controller.signal.aborted) await wait()
    }
  }

  void run()
  return () => controller.abort()
}
