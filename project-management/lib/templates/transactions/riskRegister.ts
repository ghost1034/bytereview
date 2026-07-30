/**
 * Risk register sibling project spawned with G1/G2 transaction templates.
 */
import { defineTemplate, enumOptions, tasksInSection } from '../builders'
import type { CuratedProjectTemplate } from '../types'

export const riskRegisterTemplate = defineTemplate({
  id: 'txn-risk-register',
  name: 'Deal Risk Register',
  description: 'Cross-functional risk register for corporate transactions.',
  category: 'Corporate Dev',
  iconEmoji: '⚠️',
  color: 'warning',
  defaultView: 'list',
  sectionNames: ['Open risks', 'Mitigating', 'Closed'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Likelihood', type: 'dropdown', options: enumOptions([{ label: 'Low', color: 'accent' }, { label: 'Medium', color: 'warning' }, { label: 'High', color: 'danger' }]) },
    { name: 'Impact', type: 'dropdown', options: enumOptions([{ label: 'Low', color: 'gray' }, { label: 'Medium', color: 'warning' }, { label: 'High', color: 'danger' }, { label: 'Critical', color: 'danger' }]) },
    { name: 'Mitigation', type: 'text' },
    { name: 'Owner', type: 'people' },
    { name: 'Status', type: 'dropdown', options: enumOptions([{ label: 'Open', color: 'danger' }, { label: 'Monitoring', color: 'warning' }, { label: 'Closed', color: 'accent' }]) },
  ],
  taskSpecs: [
    { name: 'Material adverse change in customer base pre-close', sectionIndex: 0, notes: 'Likelihood: Low, Impact: High', assigneeRole: 'Deal Lead' },
    { name: 'Antitrust filing delay', sectionIndex: 0, notes: 'Likelihood: Medium, Impact: Medium', assigneeRole: 'Regulatory' },
    { name: 'Key employee departure post-LOI', sectionIndex: 0, notes: 'Likelihood: Medium, Impact: High', assigneeRole: 'HR' },
    { name: 'Integration cost overrun >15%', sectionIndex: 0, notes: 'Likelihood: Medium, Impact: Medium', assigneeRole: 'IMO' },
    { name: 'Synergy realization shortfall vs plan', sectionIndex: 0, notes: 'Likelihood: High, Impact: Medium', assigneeRole: 'Corp Dev' },
    ...tasksInSection(1, ['Weekly risk review cadence', 'Escalation log maintenance'], { role: 'Deal Lead' }),
  ],
})

/** G2-specific risk register variant. */
export const spinoffRiskRegisterTemplate = defineTemplate({
  id: 'txn-spinoff-risk-register',
  name: 'Spin-off Risk Register',
  description: 'Risk register for divestiture and spin transactions.',
  category: 'Corporate Dev',
  iconEmoji: '⚠️',
  color: 'warning',
  defaultView: 'list',
  sectionNames: ['Open risks', 'Mitigating', 'Closed'],
  customFieldIds: [],
  recommendedFields: riskRegisterTemplate.recommendedFields,
  taskSpecs: [
    { name: '§355 qualification challenge by IRS', sectionIndex: 0, notes: 'Likelihood: Low, Impact: Critical', assigneeRole: 'Tax Counsel' },
    { name: 'Customer attrition during separation', sectionIndex: 0, notes: 'Likelihood: Medium, Impact: High', assigneeRole: 'Commercial' },
    { name: 'Key employee departure pre-separation', sectionIndex: 0, notes: 'Likelihood: High, Impact: High', assigneeRole: 'HR' },
    { name: 'TSA dependency overrun', sectionIndex: 0, notes: 'Likelihood: High, Impact: Medium', assigneeRole: 'TSA Lead' },
    { name: 'Stranded cost shortfall at Stay-Co', sectionIndex: 0, notes: 'Likelihood: Medium, Impact: High', assigneeRole: 'Finance' },
    ...tasksInSection(1, ['Weekly risk review', 'Stranded cost mitigation tracker'], { role: 'Separation PMO' }),
  ],
})
