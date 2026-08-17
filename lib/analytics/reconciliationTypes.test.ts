import { describe, expect, it } from 'vitest'

import {
  buildAvailableRules,
  normalizeUploadedRow,
  type ReconciliationTransaction,
} from './reconciliationTypes'

describe('reconciliation transaction normalization', () => {
  it('keeps mapped values only under canonical keys and removes upload metadata', () => {
    const transaction = normalizeUploadedRow(
      {
        'Posting Date': '2026-08-01',
        DESCRIPTION: 'Customer deposit',
        Amount: '$1,234.50',
        Reference: 'DEP-1001',
        Department: 'Advisory',
        'Source File Path(s)': '/private/uploads/bank.csv',
        _fileRole: 'Source A',
        _fileName: 'bank.csv',
      },
      'A',
      {
        'Transaction Date': 'Posting Date',
        Description: 'DESCRIPTION',
        Amount: 'Amount',
        'Reference ID': 'Reference',
      },
      0,
    )

    expect(transaction).toEqual({
      id: 'DEP-1001',
      date: '2026-08-01',
      description: 'Customer deposit',
      amount: 1234.5,
      referenceId: 'DEP-1001',
      source: 'A',
      status: 'unmatched',
      Department: 'Advisory',
    })
  })
})

describe('reconciliation rule library', () => {
  it('deduplicates categories case-insensitively and excludes metadata', () => {
    const sourceA = [
      {
        id: 'a-1',
        date: '2026-08-01',
        Date: '2026-08-01',
        description: 'Customer deposit',
        DESCRIPTION: 'Customer deposit',
        amount: 100,
        Amount: 100,
        referenceId: 'DEP-1001',
        'Reference ID': 'DEP-1001',
        source: 'A',
        status: 'unmatched',
        'Source File Path(s)': '/private/uploads/bank.csv',
        _fileName: 'bank.csv',
      } as ReconciliationTransaction,
    ]

    const categories = buildAvailableRules(sourceA, []).map(({ category }) => category)

    expect(categories).toEqual(['Date', 'Description', 'Amount', 'Reference ID'])
  })
})
