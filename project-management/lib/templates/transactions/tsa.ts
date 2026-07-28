/**
 * TSA sub-template — child project from G2 Day-1 milestone.
 */
import { defineTemplate, enumOptions, tasksInSection } from '../builders'
import type { CuratedProjectTemplate } from '../types'

const tsaServices = [
  'IT — Email & calendaring',
  'IT — Identity & SSO',
  'IT — Endpoint management (MDM)',
  'IT — Network / VPN',
  'IT — Cybersecurity SOC',
  'IT — Helpdesk & IT support',
  'IT — ERP (financials)',
  'IT — HRIS / Payroll system',
  'IT — CRM',
  'IT — Data warehouse / analytics',
  'IT — Application hosting (cloud)',
  'IT — Disaster recovery / backups',
  'Finance — Accounting close support',
  'Finance — Treasury services',
  'Finance — Tax compliance support',
  'Finance — Procure-to-pay processing',
  'HR — Benefits administration',
  'HR — Payroll processing',
  'HR — Recruiting / ATS',
  'HR — Learning management',
  'Legal — Contract management system',
  'Real Estate — Facilities management',
  'Real Estate — Office services',
  'Procurement — Indirect procurement support',
  'Customer Support — Tier-1 ticketing infra',
]

export const tsaSubTemplate = defineTemplate({
  id: 'g2-tsa-subtemplate',
  name: 'Transition Services Agreement (TSA)',
  description: 'TSA service catalog, SLA tracking, and exit planning.',
  category: 'Corporate Dev',
  iconEmoji: '🔄',
  color: 'teal',
  defaultView: 'list',
  sectionNames: ['Active services', 'Planning exit', 'In migration', 'Exited', 'Disputed'],
  customFieldIds: [],
  recommendedFields: [
    { name: 'Service name', type: 'text' },
    { name: 'Service category', type: 'dropdown', options: enumOptions([{ label: 'IT', color: 'blue' }, { label: 'Finance', color: 'amber' }, { label: 'HR', color: 'teal' }, { label: 'Legal', color: 'indigo' }, { label: 'Real Estate', color: 'purple' }]) },
    { name: 'Provider', type: 'dropdown', options: enumOptions([{ label: 'Stay-Co provides', color: 'blue' }, { label: 'Spin-Co provides', color: 'purple' }]) },
    { name: 'Scheduled exit date', type: 'date' },
    { name: 'Monthly cost', type: 'number', numberFormat: 'currency', currencySymbol: '$' },
    { name: 'Health', type: 'dropdown', options: enumOptions([{ label: 'Green', color: 'accent' }, { label: 'Yellow', color: 'warning' }, { label: 'Red', color: 'danger' }]) },
    { name: 'Migration approach', type: 'dropdown', options: enumOptions([{ label: 'Internalize', color: 'blue' }, { label: 'Third party', color: 'purple' }, { label: 'Retire', color: 'gray' }]) },
  ],
  taskSpecs: tsaServices.map((name, i) => ({
    name,
    sectionIndex: 0,
    relativeDueDays: i * 7,
    assigneeRole: name.startsWith('IT') ? 'IT Service Manager' : 'Service Manager',
  })),
  ruleTemplates: [
    { name: 'T-30 exit alert', enabled: true, trigger: { type: 'task_due_in_days', days: 30 }, conditions: [], actions: [{ type: 'send_notification', userId: 'owner', message: 'TSA service exit in 30 days' }], runCount: 0 },
    { name: 'SLA red health', enabled: true, trigger: { type: 'custom_field_changed', customFieldId: 'health' }, conditions: [{ field: 'health', op: 'eq', value: 'Red' }], actions: [{ type: 'send_notification', userId: 'owner', message: 'TSA SLA underperformance' }], runCount: 0 },
  ],
  dashboardTemplates: [{
    name: 'TSA dashboard',
    charts: [
      { title: 'Services by status', type: 'donut', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Services exited', type: 'number', source: 'tasks', filters: [], measure: 'count' },
      { title: 'Cumulative TSA cost', type: 'line', source: 'tasks', filters: [], measure: 'sum', measureField: 'monthly-cost' },
    ],
    layout: [],
  }],
})
