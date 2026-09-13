import type { EsignAiFieldPlacementProposal } from '@/lib/api'

export function removeAiSuggestionGroup(
  proposals: EsignAiFieldPlacementProposal[],
  selected: Set<string>,
  proposalId: string,
): Set<string> {
  const groupId = (proposal: EsignAiFieldPlacementProposal) => {
    const group = proposal.properties?.selection_group
    return group && typeof group === 'object' && 'id' in group ? String(group.id) : null
  }
  const proposal = proposals.find((item) => item.id === proposalId)
  const group = proposal ? groupId(proposal) : null
  const removed = new Set(proposals.filter((item) => item.id === proposalId || (group && groupId(item) === group)).map((item) => item.id))
  return new Set([...selected].filter((id) => !removed.has(id)))
}
