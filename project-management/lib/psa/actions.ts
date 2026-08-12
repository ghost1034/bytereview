import { tasklyticApiJson } from '../tasklyticApi'
import {
  useExpenseReportsStore,
  useExpensesStore,
  useTimeEntriesStore,
  useTimesheetsStore,
} from '../../stores/entities'
import type { Expense, ExpenseReport, TimeEntry, Timesheet } from '../../types'

export type PsaLifecycleKind = 'timeEntries' | 'timesheets' | 'expenses' | 'expenseReports'
export type PsaLifecycleAction = 'edit' | 'duplicate' | 'submit' | 'approve' | 'reject' | 'partial-approve' | 'write-off' | 'lock' | 'manual-receipt' | 'reimburse'

type PsaRecord = TimeEntry | Timesheet | Expense | ExpenseReport

export async function runPsaAction(
  kind: PsaLifecycleKind,
  recordId: string,
  action: PsaLifecycleAction,
  workspaceId: string,
  payload: Record<string, unknown> = {},
): Promise<PsaRecord> {
  const result = await tasklyticApiJson<{ record: PsaRecord }>(`/psa/${kind}/${recordId}:${action}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ workspaceId, ...payload }),
  })
  const stores = {
    timeEntries: useTimeEntriesStore,
    timesheets: useTimesheetsStore,
    expenses: useExpensesStore,
    expenseReports: useExpenseReportsStore,
  } as const
  await stores[kind].getState().hydrate()
  if (kind === 'timesheets') await useTimeEntriesStore.getState().hydrate()
  if (kind === 'expenseReports') await useExpensesStore.getState().hydrate()
  return result.record
}
