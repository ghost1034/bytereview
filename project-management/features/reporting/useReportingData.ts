'use client'

/** Gather workspace entity data for chart computation. */
import { useMemo } from 'react'
import type { ChartComputeContext } from '../../lib/reporting/computeChart'
import {
  useCustomFieldsStore,
  useGoalsStore,
  usePortfoliosStore,
  useProjectsStore,
  useSavedViewsStore,
  useSectionsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
  useTimeEntriesStore,
  useExpensesStore,
  useInvoicesStore,
  usePaymentsStore,
} from '../../stores/entities'

/** Build ChartComputeContext for a workspace id. */
export function useReportingData(workspaceId: string | null): ChartComputeContext | null {
  const tasks = useTasksStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const portfolios = usePortfoliosStore((s) => s.list())
  const goals = useGoalsStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const sections = useSectionsStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())
  const customFields = useCustomFieldsStore((s) => s.list())
  const savedViews = useSavedViewsStore((s) => s.list())
  const timeEntries = useTimeEntriesStore((s) => s.list())
  const expenses = useExpensesStore((s) => s.list())
  const invoices = useInvoicesStore((s) => s.list())
  const payments = usePaymentsStore((s) => s.list())

  return useMemo(() => {
    if (!workspaceId) return null
    return {
      workspaceId,
      tasks: tasks.filter((t) => t.workspaceId === workspaceId),
      projects: projects.filter((p) => p.workspaceId === workspaceId && !p.archived),
      portfolios: portfolios.filter((p) => p.workspaceId === workspaceId),
      goals: goals.filter((g) => g.workspaceId === workspaceId),
      users,
      sections,
      tags,
      customFields,
      savedViews,
      timeEntries: timeEntries.filter((entry) => entry.workspaceId === workspaceId),
      expenses: expenses.filter((expense) => expense.workspaceId === workspaceId),
      invoices: invoices.filter((invoice) => invoice.workspaceId === workspaceId),
      payments: payments.filter((payment) => payment.workspaceId === workspaceId),
    }
  }, [workspaceId, tasks, projects, portfolios, goals, users, sections, tags, customFields, savedViews, timeEntries, expenses, invoices, payments])
}
