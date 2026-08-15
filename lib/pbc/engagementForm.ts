import type { PbcEngagement } from './types'

export type PbcEngagementSource =
  | { kind: 'blank' }
  | { kind: 'template'; id: string }
  | { kind: 'rollover'; id: string }

export function parsePbcEngagementSource(value: string): PbcEngagementSource {
  if (value.startsWith('template:')) return { kind: 'template', id: value.slice('template:'.length) }
  if (value.startsWith('rollover:')) return { kind: 'rollover', id: value.slice('rollover:'.length) }
  return { kind: 'blank' }
}

export function pbcEngagementSourcePayload(source: PbcEngagementSource) {
  return {
    template_id: source.kind === 'template' ? source.id : null,
    rollover_from_id: source.kind === 'rollover' ? source.id : null,
  }
}

export function pbcRolloverCandidates(engagements: PbcEngagement[], clientId: string) {
  if (!clientId) return []
  return engagements.filter((engagement) => engagement.client_id === clientId)
}
