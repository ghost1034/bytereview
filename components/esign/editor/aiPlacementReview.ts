import type { EsignAiFieldPlacementProposal } from '@/lib/api'

export function removeAiSuggestionGroup(
  proposals: EsignAiFieldPlacementProposal[],
  selected: Set<string>,
  proposalId: string,
): Set<string> {
  const groupId = (proposal: EsignAiFieldPlacementProposal) => {
    const key = proposal.field_type === 'radio' ? 'group' : 'selection_group'
    const group = proposal.properties?.[key]
    return group && typeof group === 'object' && 'id' in group ? `${key}:${String(group.id)}` : null
  }
  const removed = new Set([proposalId])
  let changed = true
  while (changed) {
    changed = false
    const groups = new Set(proposals.filter((p) => removed.has(p.id)).map(groupId).filter(Boolean))
    for (const proposal of proposals) {
      if (!removed.has(proposal.id) && (groups.has(groupId(proposal)) || proposal.dependency_ids?.some((id) => removed.has(id)))) {
        removed.add(proposal.id)
        changed = true
      }
    }
  }
  return new Set([...selected].filter((id) => !removed.has(id)))
}
