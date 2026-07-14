import type { InkwiseCitation } from '@/lib/api'

export type InkwiseCitationResolver = (evidenceId: string, referenceIndex?: string) => InkwiseCitation | undefined

export function createInkwiseCitationResolver(citations: InkwiseCitation[] | null | undefined): InkwiseCitationResolver {
  const citationById = new Map<string, InkwiseCitation>()

  for (const citation of citations || []) {
    if (!citation?.evidence_id) continue
    citationById.set(String(citation.evidence_id), citation)
    for (const reference of citation.references || []) {
      citationById.set(reference.id, {
        ...citation,
        highlights: reference.highlight ? [reference.highlight] : [],
      })
    }
  }

  return (evidenceId, referenceIndex) => {
    const citation = citationById.get(evidenceId)
    if (!referenceIndex) return citation

    const referencedCitation = citationById.get(`${evidenceId}#${referenceIndex}`)
    if (referencedCitation) return referencedCitation
    if (!citation || citation.references?.length) return undefined
    if (!citation.highlights?.length) return citation

    const highlight = citation.highlights[Number(referenceIndex) - 1]
    return {
      ...citation,
      highlights: highlight ? [highlight] : [],
    }
  }
}

export function addLegacyCitationReferenceMarkers(markdown: string, citations: InkwiseCitation[] | null | undefined): string {
  const legacyEvidenceIds = new Set(
    (citations || [])
      .filter((citation) => citation.evidence_id && !citation.references?.length && citation.highlights?.length)
      .map((citation) => String(citation.evidence_id)),
  )
  const occurrences = new Map<string, number>()

  return (markdown || '').replace(/\[(E\d{2})\]/g, (marker, evidenceId: string) => {
    if (!legacyEvidenceIds.has(evidenceId)) return marker
    const occurrence = (occurrences.get(evidenceId) || 0) + 1
    occurrences.set(evidenceId, occurrence)
    return `[${evidenceId}#${occurrence}]`
  })
}
