/**
 * G2 — Spin-off / Divestiture task data by section.
 */
import type { TemplateTaskSpec } from '../types'
import { tasksInSection } from '../builders'

export const G2_SECTIONS = [
  'Strategic Decision & Mandate',
  'Separation Planning',
  'Carve-out Financials & Tax Structure',
  'Operational Separation Design',
  'Stand-alone Capability Build',
  'Buyer Marketing / Spin Distribution Plan',
  'Diligence Support',
  'Definitive Agreement / Separation & Distribution Agreement',
  'Regulatory & Financing',
  'Pre-Closing / Pre-Distribution',
  'Closing / Distribution Date',
  'Day-1 Stand-alone Operations',
  'Transition Services Agreement (TSA) Execution',
  'TSA Exit & Wind-down',
  'Post-Separation',
]

export function buildG2TaskSpecs(): TemplateTaskSpec[] {
  return [
    ...tasksInSection(0, [
      'Portfolio review — strategic fit', 'Business case: separate vs hold', 'Decision tree: spin / sell / IPO / RMT',
      'Capital structure implications', 'Board approval to proceed', 'Engage advisors', 'Project codename & insider list',
      'Confidentiality protocol', 'Internal need-to-know stand-up', 'Form Stay-Co and Spin-Co leadership teams',
    ], { role: 'Strategy/M&A', milestoneAt: [4] }),
    ...tasksInSection(1, [
      'Perimeter definition', 'Asset & liability allocation memo', 'Employee allocation review',
      'Contract allocation', 'IP allocation', 'Real Estate allocation', 'Customer relationship allocation',
      'Vendor relationship allocation', 'Legal entity structure', 'Capitalization of Spin-Co',
      'Pre-separation reorganization plan', 'Step plan (60+ steps document)',
    ], { startDay: 7, role: 'Separation PMO' }),
    ...tasksInSection(2, [
      'Historical carve-out financials — 3 yrs', 'Audit of carve-out financials (PCAOB)', 'Pro forma adjustments',
      'Allocation methodologies', 'Stand-alone cost analysis', 'Stranded cost analysis', 'Working capital at separation',
      'Net debt allocation', 'Tax-free qualification analysis (§355)', 'Private Letter Ruling from IRS',
      'Tax opinion — Section 355 qualification', 'Tax Sharing Agreement drafted', 'Tax Matters Agreement drafted',
      'E&P allocation', '§382 NOL implications', 'State tax considerations',
    ], { startDay: 14, role: 'Carve-out Financials', milestoneAt: [1, 10] }),
    ...tasksInSection(3, [
      'Target Operating Model — Spin-Co', 'TOM — Stay-Co post-separation', 'Org design — Spin-Co', 'Org design — Stay-Co',
      'Job leveling & comp benchmarking', 'Retention plans — key employees', 'Workforce transition plan / WARN',
      'IT systems inventory', 'IT systems allocation', 'IT separation roadmap', 'ERP carve-out plan', 'HRIS carve-out',
      'Email / collaboration separation', 'Identity & access separation', 'Network & data center separation',
      'Cybersecurity separation', 'Application portfolio rationalization', 'Data separation & privacy',
      'Customer data segregation', 'Backups & archives — chain of custody',
    ], { startDay: 28, role: 'IT/Operations' }),
    ...tasksInSection(4, [
      'Spin-Co leadership team named', 'Spin-Co Board composition', 'Stand-alone Finance function',
      'Stand-alone HR function', 'Stand-alone Legal function', 'Stand-alone IT function', 'Stand-alone Procurement',
      'Stand-alone Real Estate / Workplace', 'Banking relationships', 'Audit firm engagement — Spin-Co',
      'Insurance — own policies', 'Treasury — cash mgmt', 'Brand & identity', 'ERP go-live', 'HRIS go-live',
      'CRM go-live', 'Public-company readiness (if IPO/spin)',
    ], { startDay: 42, role: 'Spin-Co functional leads' }),
    ...tasksInSection(5, [
      'Build CIM', 'Build management presentation', 'Tease the market', 'Sign NDAs', 'Distribute CIM',
      'Process letter — Round 1', 'Manage data room access', 'Round 1 IOIs — analyze', 'Round 2 — management meetings',
      'Final bids', 'Select winning bidder', 'Form 10 drafting', 'Form 10 SEC review cycles',
      'Information statement to shareholders', 'Record date / Distribution date set', 'NYSE/Nasdaq listing application',
      'Roadshow', 'Day-1 IR materials', 'Stand-alone financial guidance', 'Analyst day (post-spin)',
    ], { startDay: 49, role: 'IR/Banker', milestoneAt: [11, 15] }),
    ...tasksInSection(6, [
      'Diligence response coordination', 'Sell-side QoE report', 'Sell-side legal report', 'Sell-side tax report',
      'Sell-side IT report', 'Sell-side commercial report', 'Customer / vendor reference support',
      'Management presentations to bidders', 'Diligence Q&A management',
    ], { startDay: 56, role: 'Diligence lead' }),
    ...tasksInSection(7, [
      'SPA / Merger Agreement negotiation', 'Separation & Distribution Agreement', 'TSA negotiation',
      'IP cross-licenses', 'Supply / Reverse Supply Agreements', 'Employee Matters Agreement',
      'Tax Matters Agreement', 'Real Estate sub-leases', 'Shared facilities agreements', 'Disclosure schedules',
    ], { startDay: 63, role: 'Legal' }),
    ...tasksInSection(8, [
      'HSR filing (US)', 'EU / UK / China antitrust', 'Other regulatory approvals', 'Buyer financing certainty',
      'IRS PLR response review', 'Tax opinion finalized', 'SEC effectiveness of Form 10', 'Stock exchange approval',
      'Shareholder approval', 'Lender consents', 'New debt at Spin-Co',
    ], { startDay: 70, role: 'Regulatory/Tax', milestoneAt: [5, 6] }),
    ...tasksInSection(9, [
      'Third-party consents', 'Contract assignment letters', 'Notice to vendors', 'Notice to employees (WARN)',
      'Pre-clear closing checklist', 'Stand up Spin-Co Board', 'Spin-Co officer appointments',
      'Spin-Co bylaws & charter', 'Working group all-hands (T-7)', 'Funds movement plan',
    ], { startDay: 77, role: 'Separation PMO' }),
    ...tasksInSection(10, [
      'Execute closing docs / wire transfers (Sale)', 'Effective distribution — stock to shareholders (Spin)',
      'Press release issued', '8-K filings — Stay-Co and Spin-Co', 'Employee announcements',
      'Day-0 town halls', 'Customer & vendor notification waves',
    ], { startDay: 84, role: 'Deal Lead', milestoneAt: [0, 1] }),
    ...tasksInSection(11, [
      'Day-1 readiness checklist (per workstream)', 'Customer communications — top 50', 'Vendor communications',
      'Banking & treasury operational', 'Payroll continuity confirmed', 'Benefits enrollment / continuity',
      'IT access — Day-1 functional', 'Brand transition', 'IR functions live (Spin-Co)', 'First earnings cycle prep',
    ], { startDay: 85, role: 'Spin-Co functional leads' }),
    ...tasksInSection(12, [
      'TSA governance established', 'Service catalog finalized', 'Service-level metrics & monthly reporting',
      'Monthly TSA invoicing & settlement', 'Issue / escalation log', 'Quarterly service review',
      'Service-level credits / disputes',
    ], { startDay: 86, role: 'TSA Lead' }),
    ...tasksInSection(13, [
      'Per-service exit plans', 'Migration of each service', 'Final TSA service month per service',
      'Knowledge transfer (runbooks)', 'Final TSA termination & true-up', 'Stranded cost true-up at Stay-Co',
    ], { startDay: 120, role: 'TSA Lead', milestoneAt: [4] }),
    ...tasksInSection(14, [
      'Working capital true-up (Sale)', 'Indemnification claims (Sale)', 'Tax allocations & shared filings',
      'Audit support for transition periods', '§355 anti-Morris-Trust monitoring', 'Cost true-up vs budget',
      'Post-mortem / lessons learned', 'One-year retention check (both sides)',
    ], { startDay: 150, role: 'Separation PMO', milestoneAt: [6] }),
  ]
}
