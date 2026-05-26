export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  source: 'A' | 'B';
  status: 'matched' | 'unmatched' | 'suggested';
  matchGroupId?: string;
  exceptionCategory?: string;
  exceptionReasoning?: string;
  [key: string]: any;
};

export type MatchGroup = {
  id: string;
  type: '1:1' | '1:Many' | 'Many:1' | 'Many:Many';
  sourceAIds?: string[];
  sourceBIds?: string[];
  totalA: number;
  totalB: number;
  confidence: number;
  explanation: string;
  status: string;
  aiDetails?: any;
};

export function generateRealisticDemoData() {
  const a: Transaction[] = [];
  const b: Transaction[] = [];
  const groups: MatchGroup[] = [];

  let aId = 1, bId = 1, gId = 1;

  const addA = (tx: Partial<Transaction>) => {
    const id = `a${aId++}`;
    a.push({ id, source: 'A', ...tx } as Transaction);
    return id;
  };

  const addB = (tx: Partial<Transaction>) => {
    const id = `b${bId++}`;
    b.push({ id, source: 'B', ...tx } as Transaction);
    return id;
  };

  // ---------------------------------------------------------
  // 1. 1:1 match, with date, amount and description variations
  // ---------------------------------------------------------
  for (let i = 0; i < 35; i++) {
    const amount = 100 + Number((Math.random() * 100).toFixed(2));
    const isSlightDelay = i % 3 === 0;
    const isFuzzyAmount = i % 5 === 0; // Maybe slight penny variance for matching engine

    const idA = addA({
      date: '2026-04-01',
      description: `Vendor Pmt REF-${1000 + i}`,
      amount,
      status: 'matched'
    });

    const idB = addB({
      date: isSlightDelay ? '2026-04-02' : '2026-04-01',
      description: `ACH Outbound Ref ${1000 + i}`,
      amount: -amount,
      status: 'matched'
    });

    groups.push({
      id: `g${gId++}`,
      type: '1:1',
      sourceAIds: [idA],
      sourceBIds: [idB],
      totalA: amount,
      totalB: -amount,
      confidence: isSlightDelay ? 0.92 : 0.99,
      explanation: 'High confidence match on amount and sequential date.',
      status: 'approved'
    });
  }

  // ---------------------------------------------------------
  // 2. Many to 1 match
  // ---------------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const amt1 = 50.25 + i * 10;
    const amt2 = 75.50 + i * 5;
    const amt3 = 20.00;
    const total = amt1 + amt2 + amt3;

    const idA1 = addA({ date: '2026-04-05', description: `POS Swipe A-${i}`, amount: amt1, status: 'matched' });
    const idA2 = addA({ date: '2026-04-05', description: `POS Swipe B-${i}`, amount: amt2, status: 'matched' });
    const idA3 = addA({ date: '2026-04-05', description: `POS Swipe C-${i}`, amount: amt3, status: 'matched' });

    const idB = addB({ date: '2026-04-06', description: `Daily POS Settlement ${i}`, amount: -total, status: 'matched' });

    groups.push({
      id: `g${gId++}`,
      type: 'Many:1',
      sourceAIds: [idA1, idA2, idA3],
      sourceBIds: [idB],
      totalA: total,
      totalB: -total,
      confidence: 0.95,
      explanation: 'Sum of 3 distinct POS swipes perfectly matches the consolidated daily settlement amount.',
      status: 'approved'
    });
  }

  // ---------------------------------------------------------
  // 3. 1 to Many match
  // ---------------------------------------------------------
  for (let i = 0; i < 8; i++) {
    const amt1 = 150.00 + i * 20;
    const amt2 = 250.00 + i * 10;
    const total = amt1 + amt2;

    const idA = addA({ date: '2026-04-08', description: `Batch Customer Deposit ${i}`, amount: total, status: 'matched' });

    const idB1 = addB({ date: '2026-04-07', description: `Inv 10${i} Payment`, amount: -amt1, status: 'matched' });
    const idB2 = addB({ date: '2026-04-07', description: `Inv 11${i} Payment`, amount: -amt2, status: 'matched' });

    groups.push({
      id: `g${gId++}`,
      type: '1:Many',
      sourceAIds: [idA],
      sourceBIds: [idB1, idB2],
      totalA: total,
      totalB: -total,
      confidence: 0.96,
      explanation: 'Batch deposit directly corresponds to the sum of 2 individual invoice payments.',
      status: 'approved'
    });
  }

  // ---------------------------------------------------------
  // 4. Many to Many match
  // ---------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const idA1 = addA({ date: '2026-04-10', description: `Stripe Payout P1-${i}`, amount: 100.00 + (i * 10), status: 'matched' });
    const idA2 = addA({ date: '2026-04-10', description: `Stripe Payout P2-${i}`, amount: 200.00 + (i * 20), status: 'matched' });

    const total = 300.00 + (i * 30);

    const idB1 = addB({ date: '2026-04-09', description: `Stripe Chg A-${i}`, amount: -(total * 0.5), status: 'matched' });
    const idB2 = addB({ date: '2026-04-09', description: `Stripe Chg B-${i}`, amount: -(total * 0.3), status: 'matched' });
    const idB3 = addB({ date: '2026-04-09', description: `Stripe Chg C-${i}`, amount: -(total * 0.2), status: 'matched' });

    groups.push({
      id: `g${gId++}`,
      type: 'Many:Many',
      sourceAIds: [idA1, idA2],
      sourceBIds: [idB1, idB2, idB3],
      totalA: total,
      totalB: -total,
      confidence: 0.88,
      explanation: 'Complex settlement where 2 separate payouts exactly equal 3 distinct charges.',
      status: 'suggested'
    });
  }

  // ---------------------------------------------------------
  // 5. Unmatched data with failed 1:1 match
  // ---------------------------------------------------------
  for (let i = 0; i < 3; i++) {
    const baseAmt = 49.99 + i * 50;
    addA({
      date: '2026-04-12',
      description: `Software Sub ${i}`,
      amount: baseAmt,
      status: 'unmatched',
      exceptionCategory: 'AMOUNT_MISMATCH',
      exceptionReasoning: 'Found highly similar string match in GL but differing by exactly $5.00.'
    });
    addB({
      date: '2026-04-12',
      description: `Software Sub ${i}`,
      amount: -(baseAmt - 5.00),
      status: 'unmatched',
      exceptionCategory: 'AMOUNT_MISMATCH',
      exceptionReasoning: 'Found highly similar string match in Bank but differing by exactly $5.00.'
    });
  }

  // ---------------------------------------------------------
  // 6. Unmatched data with failed 1:Many match
  // ---------------------------------------------------------
  for (let i = 0; i < 2; i++) {
    addA({
      date: '2026-04-14',
      description: `Bulk Component Order ${i}`,
      amount: 5000.00,
      status: 'unmatched',
      exceptionCategory: 'MISSING_COMPONENT',
      exceptionReasoning: 'Bank shows 5000.00 debit. AI only found $4000.00 in related GL purchase orders.'
    });
    addB({
      date: '2026-04-13',
      description: `PO-8422${i}-1`,
      amount: -3000.00,
      status: 'unmatched',
      exceptionCategory: 'MISSING_COMPONENT',
      exceptionReasoning: 'Isolated partial component of an unmatched $5000 bank transaction.'
    });
    addB({
      date: '2026-04-13',
      description: `PO-8422${i}-2`,
      amount: -1000.00,
      status: 'unmatched',
      exceptionCategory: 'MISSING_COMPONENT',
      exceptionReasoning: 'Isolated partial component of an unmatched $5000 bank transaction.'
    });
  }

  // ---------------------------------------------------------
  // 7. Unmatched data with failed Many:1 match
  // ---------------------------------------------------------
  for (let i = 0; i < 2; i++) {
    addA({
      date: '2026-04-15',
      description: `Store A Deposit ${i}`,
      amount: 1200.00,
      status: 'unmatched',
      exceptionCategory: 'RECON_VARIANCE',
      exceptionReasoning: 'Stores sum to $2000. GL cash clearing expects $2500.00. Missing $500 delta.'
    });
    addA({
      date: '2026-04-15',
      description: `Store B Deposit ${i}`,
      amount: 800.00,
      status: 'unmatched',
      exceptionCategory: 'RECON_VARIANCE',
      exceptionReasoning: 'Stores sum to $2000. GL cash clearing expects $2500.00. Missing $500 delta.'
    });
    addB({
      date: '2026-04-15',
      description: `Daily Cash Clearing T-${i}`,
      amount: -2500.00,
      status: 'unmatched',
      exceptionCategory: 'RECON_VARIANCE',
      exceptionReasoning: 'Expected $2500.00. Only found $2000.00 in corresponding bank deposits.'
    });
  }

  // ---------------------------------------------------------
  // 8. Unmatched data with failed Many:Many match
  // ---------------------------------------------------------
  addA({
    date: '2026-04-16', description: `Amex Settlement 1`, amount: 530.00, status: 'unmatched',
    exceptionCategory: 'COMPLEX_VARIANCE', exceptionReasoning: 'Grouping subset failed validation against remaining ledger items ($1000 total vs $1100 anticipated).'
  });
  addA({
    date: '2026-04-16', description: `Amex Settlement 2`, amount: 470.00, status: 'unmatched',
    exceptionCategory: 'COMPLEX_VARIANCE', exceptionReasoning: 'Grouping subset failed validation against remaining ledger items ($1000 total vs $1100 anticipated).'
  });

  addB({
    date: '2026-04-16', description: `Invoice Q-11`, amount: -300.00, status: 'unmatched',
    exceptionCategory: 'COMPLEX_VARIANCE', exceptionReasoning: 'Unable to form valid sum equation with pending Amex settlements.'
  });
  addB({
    date: '2026-04-16', description: `Invoice Q-12`, amount: -300.00, status: 'unmatched',
    exceptionCategory: 'COMPLEX_VARIANCE', exceptionReasoning: 'Unable to form valid sum equation with pending Amex settlements.'
  });
  addB({
    date: '2026-04-16', description: `Invoice Q-13`, amount: -500.00, status: 'unmatched',
    exceptionCategory: 'COMPLEX_VARIANCE', exceptionReasoning: 'Unable to form valid sum equation with pending Amex settlements.'
  });

  // Purely missing
  addA({
    date: '2026-04-18', description: `Unexpected Wire Fee`, amount: 15.00, status: 'unmatched',
    exceptionCategory: 'BANK_FEE', exceptionReasoning: 'Bank fee detected on statement but not journaled in GL.'
  });
  addB({
    date: '2026-04-18', description: `Accrued Expense Rev`, amount: -125.00, status: 'unmatched',
    exceptionCategory: 'TIMING', exceptionReasoning: 'Expense accrued in GL but no corresponding bank outflow found yet.'
  });

  return { a, b, groups };
}

export const { a: INITIAL_SOURCE_A, b: INITIAL_SOURCE_B, groups: INITIAL_GROUPS } = generateRealisticDemoData();
