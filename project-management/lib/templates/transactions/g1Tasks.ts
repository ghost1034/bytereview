/**
 * G1 — Strategic Acquisition (Buy-Side) task data by section.
 */
import type { TemplateTaskSpec } from '../types'
import { tasksInSection } from '../builders'

export const G1_SECTIONS = [
  'Strategic Rationale & Mandate',
  'Target Identification & Screening',
  'Initial Outreach & NDA',
  'Preliminary Diligence & Valuation',
  'Letter of Intent (LOI)',
  'Confirmatory Due Diligence',
  'Definitive Agreement & Negotiation',
  'Financing & Regulatory',
  'Pre-Closing',
  'Closing',
  'Day 1 Readiness',
  'Post-Merger Integration (Day 1 → Day 100)',
  'Value Capture & Synergy Tracking',
  'Post-Close (Year 1+)',
]

export function buildG1TaskSpecs(): TemplateTaskSpec[] {
  return [
    ...tasksInSection(0, [
      'Investment thesis memo (build/buy/partner)', 'Strategic fit analysis', 'Capital allocation framework refresh',
      'Board approval to pursue M&A in this category', 'Define deal screening criteria', 'Confirm financing envelope',
      'Set up secure deal data room', 'Codename selection & confidentiality protocol',
      'Insider list & blackout window administration',
    ], { role: 'Corp Dev', milestoneAt: [3] }),
    {
      name: 'Assemble deal team',
      sectionIndex: 0,
      relativeDueDays: 5,
      assigneeRole: 'Corp Dev',
      subtasks: [
        { name: 'Internal team roster', relativeDueDays: 5, assigneeRole: 'Corp Dev' },
        { name: 'External advisors engaged', relativeDueDays: 7, assigneeRole: 'Corp Dev' },
      ],
    },
    ...tasksInSection(1, [
      'Build long-list (target universe)', 'Apply screens', 'Short-list of 3–5', 'Banker engagement letter',
      'Outreach strategy per target', 'Preliminary valuation framework', 'Synergy framework — hypothesis tree',
      'Investment committee pre-read', 'IC approval to approach',
    ], { startDay: 7, role: 'Corp Dev', milestoneAt: [8] }),
    ...tasksInSection(2, [
      'Initial outreach', 'Mutual NDA executed', 'Process letter received', 'Initial information request list',
      'Indication of interest drafted & submitted', 'Auction milestone tracking',
    ], { startDay: 14, role: 'Corp Dev', milestoneAt: [1] }),
    ...tasksInSection(3, [
      'Review CIM / management presentation', 'Management meeting #1', 'Preliminary financial analysis',
      'Preliminary QoE flags', 'Customer / market diligence', 'Competitive positioning', 'Synergy hypothesis sizing',
      'Standalone valuation range', 'Synergy-inclusive valuation range', 'Sensitivity & scenarios',
      'Capital structure modeling', 'Returns analysis (IRR, MOIC, NPV)', 'IC Round 2 pre-read', 'Authorization to submit LOI',
    ], { startDay: 21, role: 'Corp Dev', milestoneAt: [12, 13] }),
    ...tasksInSection(4, [
      'Draft LOI', 'Internal approvals (IC / Board sub-committee)', 'Submit LOI', 'LOI negotiation rounds', 'LOI executed',
    ], { startDay: 35, role: 'Corp Dev', milestoneAt: [4] }),
    ...tasksInSection(5, [
      'Open virtual data room (VDR) access', 'Diligence request list issued', 'Diligence Q&A queue established',
      'Legal DD memo', 'Tax DD memo', 'Financial DD (Quality of Earnings)', 'HR DD memo', 'IT & Cyber DD memo',
      'Commercial DD', 'Operational DD', 'IP DD', 'Real Estate DD', 'Environmental DD', 'Insurance DD',
      'Sanctions / OFAC / FCPA / AML review', 'Pension & retirement liabilities', 'Antitrust / regulatory feasibility memo',
      'CFIUS analysis', 'Diligence findings consolidation memo', 'Material issues escalation log',
      'Revised valuation post-DD', 'IC final approval to proceed',
    ], { startDay: 42, role: 'Workstream leads', milestoneAt: [21] }),
    ...tasksInSection(6, [
      'Definitive agreement structure decision', 'Reps & warranties negotiation', 'Indemnification terms',
      'Disclosure schedules review', 'Earn-out structure', 'Working capital target & adjustment mechanism',
      'Escrow arrangements', 'R&W insurance — bind policy', 'Employment agreements — key employees',
      'Non-compete / non-solicit', 'Transition Services Agreement scope & pricing', 'IP cross-license / assignment',
      'Supply / Reverse Supply Agreements', 'Closing payments schedule (funds flow)', 'Solvency opinion',
    ], { startDay: 70, role: 'Legal/Tax', milestoneAt: [7] }),
    ...tasksInSection(7, [
      'Debt commitment letters', 'Bank syndication kickoff', 'Lender DD support', 'Final debt documentation',
      'Equity financing authorization', 'HSR filing', 'EU / UK / China antitrust filings', 'CFIUS notification',
      'Industry-specific regulator approvals', 'Clean team protocols in place', 'Solvency opinion (leveraged)',
    ], { startDay: 77, role: 'Treasury/Regulatory' }),
    ...tasksInSection(8, [
      'Closing conditions checklist tracking', "Officers' certificates", "Secretary's certificates",
      'Good standing certificates', 'Lien searches & UCC-3 releases', 'Third-party consents',
      'Regulatory closing conditions confirmed', 'Bring-down certificates', 'Final disclosure schedules update',
      'Funds availability confirmation', 'Press release & 8-K drafted', 'Communications plan — Day-0 / Day-1',
    ], { startDay: 84, role: 'Deal team' }),
    ...tasksInSection(9, [
      'Final purchase price calculation', 'Funds flow execution', 'Execute closing documents', 'Wire confirmations received',
      'Closing book assembled & distributed', 'Press release issued', 'Employee announcement', 'Public filings (8-K)',
    ], { startDay: 90, role: 'Deal Lead', milestoneAt: [1, 2] }),
    ...tasksInSection(10, [
      'Day-1 checklist executed (per workstream)', 'CEO / Sponsor welcome message', 'Employee town hall — combined',
      'Customer communication — top 50', 'Vendor communication — material vendors', 'IT account provisioning kickoff',
      'Payroll continuity confirmed', 'Benefits transition strategy executed', 'Banking / treasury account access',
      'Insurance policies updated', 'Brand / domains transition started', 'Day-1 IR / external messaging',
    ], { startDay: 91, role: 'IMO' }),
    ...tasksInSection(11, [
      'Stand up Integration Management Office (IMO)', 'Steering committee cadence (weekly)', 'Workstream charters',
      'Day-1 → Day-100 milestone plan', 'Cultural integration plan & survey baseline', 'Talent retention plan execution',
      'Org design finalized', 'Risk register live', 'Issue escalation tracker', 'Synergy initiative chartering',
    ], { startDay: 92, role: 'IMO' }),
    ...tasksInSection(12, [
      'Synergy tracking dashboard live', 'Run-rate vs in-year synergies tracked monthly',
      'Cost synergy initiatives — execution', 'Revenue synergy initiatives — execution',
      'Variance analysis (actual vs plan) — monthly', 'Synergy reporting to Board / IC — quarterly',
      'Synergy stage gates operational', 'Reinvestment decisions',
    ], { startDay: 100, role: 'Synergy office' }),
    ...tasksInSection(13, [
      'Working capital true-up', 'Indemnification claim management', 'Earn-out tracking & payments',
      'R&W insurance claims management', 'Tax matters — short period return', 'Goodwill impairment assessment',
      'Post-mortem / lessons learned playbook update', 'One-year retention check on key employees',
      'Year-1 synergy realization report', 'Audit committee briefing on M&A program',
    ], { startDay: 120, role: 'Corp Dev', milestoneAt: [6] }),
  ]
}
