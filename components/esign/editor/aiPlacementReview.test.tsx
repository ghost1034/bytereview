// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EsignAiFieldPlacementProposal } from '@/lib/api'
import { AiPlacementIssues } from './AiPlacementIssues'
import { removeAiSuggestionGroup } from './aiPlacementReview'

beforeAll(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })

const proposal = (id: string, group?: string): EsignAiFieldPlacementProposal => ({
  id, document_id: 'doc', participant_id: 'signer', field_type: 'checkbox', page_number: 2,
  pos_x: .1, pos_y: .2, width: .02, height: .02, required: false,
  properties: group ? { selection_group: { id: group } } : {},
})

describe('AI placement review', () => {
  it('removes the complete choice group and preserves unrelated fields', () => {
    const proposals = [proposal('yes', 'g'), proposal('no', 'g'), proposal('name')]
    expect([...removeAiSuggestionGroup(proposals, new Set(['yes', 'no', 'name']), 'no')]).toEqual(['name'])
    expect([...removeAiSuggestionGroup(proposals, new Set(['yes', 'no', 'name']), 'name')]).toEqual(['yes', 'no'])
  })

  it('removes radio peers and transitive dependents without removing their sources', () => {
    const source = { ...proposal('amount'), field_type: 'number' as const }
    const computed = { ...proposal('computed'), field_type: 'formula' as const, dependency_ids: ['amount'] }
    const conditional = { ...proposal('conditional'), dependency_ids: ['computed'] }
    const radio = (id: string): EsignAiFieldPlacementProposal => ({ ...proposal(id), field_type: 'radio', properties: { group: { id: 'r' } } })
    const proposals = [source, computed, conditional, radio('a'), radio('b')]
    const ids = new Set(proposals.map((p) => p.id))
    expect([...removeAiSuggestionGroup(proposals, ids, 'amount')]).toEqual(['a', 'b'])
    expect([...removeAiSuggestionGroup(proposals, ids, 'computed')]).toEqual(['amount', 'a', 'b'])
    expect([...removeAiSuggestionGroup(proposals, ids, 'a')]).toEqual(['amount', 'computed', 'conditional'])
  })

  it('shows an unresolved target and navigates to its original document and page', async () => {
    const element = document.createElement('div')
    const root = createRoot(element)
    const onFocus = vi.fn()
    const issue = { document_id: 'other-document', page_number: 2, label: 'Witness signature', code: 'unassigned' as const, reason: 'No witness role is configured.' }
    await act(async () => root.render(<AiPlacementIssues issues={[issue]} onFocus={onFocus} />))
    expect(element.textContent).toContain('Witness signature · Page 3')
    expect(element.textContent).toContain(issue.reason)
    await act(async () => element.querySelector('button')?.click())
    expect(onFocus).toHaveBeenCalledWith(issue)
    await act(async () => root.unmount())
  })
})
