/**
 * Persist evaluation tenant metadata (last provisioned, stats) in localStorage.
 */
import type { EvaluationTenantId } from './tenantCatalog'

const KEY = 'tasklytic:evalMeta:v1'

export type EvalTenantMeta = {
  workspaceId: string
  lastProvisionedAt: string
  projectCount: number
  taskCount: number
}

type MetaMap = Partial<Record<EvaluationTenantId, EvalTenantMeta>>

function read(): MetaMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as MetaMap
  } catch {
    return {}
  }
}

function write(map: MetaMap): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function getEvalTenantMeta(id: EvaluationTenantId): EvalTenantMeta | undefined {
  return read()[id]
}

export function setEvalTenantMeta(id: EvaluationTenantId, meta: EvalTenantMeta): void {
  const map = read()
  map[id] = meta
  write(map)
}

export function exportEvalSnapshot(): string {
  return JSON.stringify(read(), null, 2)
}

export function importEvalSnapshot(json: string): void {
  write(JSON.parse(json) as MetaMap)
}
