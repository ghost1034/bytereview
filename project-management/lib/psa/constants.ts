import type { ExpenseCategory } from '../../types'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel_air: 'Air travel',
  travel_lodging: 'Lodging',
  travel_ground: 'Ground transport',
  meals_client: 'Client meals',
  meals_team: 'Team meals',
  supplies: 'Supplies',
  third_party: 'Third party',
  filing_fees: 'Filing fees',
  court_fees: 'Court fees',
  expert_fees: 'Expert fees',
  witness_fees: 'Witness fees',
  service_fees: 'Service fees',
  process_server: 'Process server',
  copies: 'Copies',
  postage_shipping: 'Postage & shipping',
  telecom: 'Telecom',
  software_subscriptions: 'Software',
  training_cpe: 'Training / CPE',
  mileage: 'Mileage',
  parking_tolls: 'Parking & tolls',
  other: 'Other',
}

export const PASS_THROUGH_CATEGORIES = new Set<ExpenseCategory>([
  'filing_fees',
  'court_fees',
  'expert_fees',
  'service_fees',
  'process_server',
])

export const UTBMS_ACTIVITY_CODES = [
  { code: 'A101', label: 'Plan' },
  { code: 'A102', label: 'Research' },
  { code: 'L110', label: 'Fact Investigation' },
  { code: 'L120', label: 'Analysis' },
  { code: 'L310', label: 'Written Discovery' },
  { code: 'L330', label: 'Depositions' },
  { code: 'L450', label: 'Trial' },
  { code: 'C100', label: 'Counseling' },
]

export const DEFAULT_MILEAGE_RATE = 0.67

export const TIME_ENTRY_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  billed: 'Billed',
  written_off: 'Written off',
}
