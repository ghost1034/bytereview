/** Extensible reporting-source registry shared by builders and aggregators. */
import type { Chart } from '../../types'

export type ReportingField = { id: string; label: string }

export type ReportingSourceDefinition = {
  id: Chart['source']
  label: string
  groupFields: ReportingField[]
  measureFields: ReportingField[]
  dateFields: ReportingField[]
}

const sources = new Map<Chart['source'], ReportingSourceDefinition>()

/** Register or replace a source. PSA phases use this seam without changing the builder. */
export function registerReportingSource(definition: ReportingSourceDefinition): void {
  sources.set(definition.id, definition)
}

export function reportingSources(): ReportingSourceDefinition[] {
  return [...sources.values()]
}

export function reportingSource(id: Chart['source']): ReportingSourceDefinition {
  const source = sources.get(id)
  if (!source) throw new Error(`Reporting source is not registered: ${id}`)
  return source
}

registerReportingSource({
  id: 'tasks',
  label: 'Tasks',
  groupFields: [
    { id: 'assigneeId', label: 'Assignee' },
    { id: 'completed', label: 'Completion' },
    { id: 'project', label: 'Project' },
    { id: 'section', label: 'Section' },
    { id: 'tag', label: 'Tag' },
    { id: 'createdAt', label: 'Created week' },
    { id: 'dueOn', label: 'Due date' },
  ],
  measureFields: [],
  dateFields: [
    { id: 'createdAt', label: 'Created date' },
    { id: 'completedAt', label: 'Completion date' },
    { id: 'dueOn', label: 'Due date' },
    { id: 'startOn', label: 'Start date' },
  ],
})

registerReportingSource({
  id: 'projects',
  label: 'Projects',
  groupFields: [
    { id: 'status', label: 'Status' },
    { id: 'teamId', label: 'Team' },
    { id: 'ownerId', label: 'Owner' },
  ],
  measureFields: [{ id: 'taskCount', label: 'Task count' }],
  dateFields: [
    { id: 'createdAt', label: 'Created date' },
    { id: 'modifiedAt', label: 'Modified date' },
  ],
})

// Existing non-PSA sources remain registered for backward compatibility.
registerReportingSource({
  id: 'portfolios',
  label: 'Portfolios',
  groupFields: [{ id: 'status', label: 'Status' }],
  measureFields: [],
  dateFields: [{ id: 'createdAt', label: 'Created date' }],
})
registerReportingSource({
  id: 'goals',
  label: 'Goals',
  groupFields: [{ id: 'status', label: 'Status' }, { id: 'ownerId', label: 'Owner' }],
  measureFields: [{ id: 'progress', label: 'Progress %' }],
  dateFields: [{ id: 'createdAt', label: 'Created date' }],
})

registerReportingSource({
  id: 'time', label: 'Time entries',
  groupFields: ['userId', 'clientId', 'matterId', 'projectId', 'status', 'billable', 'activityCode'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'hours', label: 'Hours' }, { id: 'amount', label: 'Amount' }],
  dateFields: [{ id: 'date', label: 'Entry date' }, { id: 'approvedAt', label: 'Approval date' }],
})
registerReportingSource({
  id: 'expenses', label: 'Expenses',
  groupFields: ['userId', 'clientId', 'matterId', 'projectId', 'status', 'category', 'reimbursable'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'totalAmount', label: 'Total' }, { id: 'billableAmount', label: 'Billable amount' }],
  dateFields: [{ id: 'date', label: 'Expense date' }, { id: 'reimbursedAt', label: 'Reimbursement date' }],
})
registerReportingSource({
  id: 'utilization', label: 'Utilization',
  groupFields: [{ id: 'userId', label: 'Person' }, { id: 'billable', label: 'Billable' }],
  measureFields: [{ id: 'hours', label: 'Hours' }, { id: 'utilizationPercent', label: 'Utilization %' }],
  dateFields: [{ id: 'date', label: 'Entry date' }],
})
registerReportingSource({
  id: 'wip', label: 'Work in progress',
  groupFields: [{ id: 'clientId', label: 'Client' }, { id: 'matterId', label: 'Matter / engagement' }, { id: 'status', label: 'Status' }],
  measureFields: [{ id: 'amount', label: 'WIP amount' }],
  dateFields: [{ id: 'date', label: 'Work date' }, { id: 'approvedAt', label: 'Approval date' }],
})
registerReportingSource({
  id: 'invoices', label: 'Invoices',
  groupFields: ['clientId', 'matterId', 'status', 'currency'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'total', label: 'Invoiced' }, { id: 'amountPaid', label: 'Paid' }, { id: 'amountOutstanding', label: 'Outstanding' }],
  dateFields: [{ id: 'issueDate', label: 'Issue date' }, { id: 'dueOn', label: 'Due date' }],
})
registerReportingSource({
  id: 'payments', label: 'Payments',
  groupFields: ['clientId', 'invoiceId', 'method', 'currency', 'status'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'amount', label: 'Payment amount' }],
  dateFields: [{ id: 'paidAt', label: 'Payment date' }, { id: 'createdAt', label: 'Recorded date' }],
})
registerReportingSource({
  id: 'realization', label: 'Realization',
  groupFields: ['userId', 'clientId', 'matterId', 'projectId', 'currency'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'realizationPercent', label: 'Realization %' }, { id: 'amount', label: 'Billed amount' }],
  dateFields: [{ id: 'date', label: 'Work date' }, { id: 'billedAt', label: 'Billed date' }],
})
registerReportingSource({
  id: 'effective_rate', label: 'Effective rate',
  groupFields: ['userId', 'clientId', 'matterId', 'projectId', 'currency'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'effectiveRate', label: 'Effective rate' }, { id: 'hours', label: 'Hours' }],
  dateFields: [{ id: 'date', label: 'Work date' }, { id: 'billedAt', label: 'Billed date' }],
})
registerReportingSource({
  id: 'ar_aging', label: 'AR aging',
  groupFields: ['clientId', 'currency', 'agingBucket'].map((id) => ({ id, label: id })),
  measureFields: [{ id: 'amountOutstanding', label: 'Outstanding' }],
  dateFields: [{ id: 'issueDate', label: 'Issue date' }, { id: 'dueOn', label: 'Due date' }],
})
