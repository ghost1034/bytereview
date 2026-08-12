/**
 * Boot-time hydration — loads entity collections from the repository.
 */
import { usesTasklyticBackend } from '../lib/forms/publicFormApi'
import { getRepository } from '../lib/repository'
import { setActiveRepositoryWorkspaceId } from '../lib/repository/workspaceScope'
import { registerActivityWriter } from '../lib/activity'
import { useAuthStore, useUiStore } from './auth'
import {
  useActivityStore,
  useAttachmentsStore,
  useCommentsStore,
  useCustomFieldsStore,
  useDashboardsStore,
  useFormSubmissionsStore,
  useFormsStore,
  useGoalsStore,
  useNotificationsStore,
  usePendingEmailsStore,
  usePortfoliosStore,
  useProjectsStore,
  useRulesStore,
  useSavedViewsStore,
  useSectionsStore,
  useStatusUpdatesStore,
  useProjectMessagesStore,
  useTagsStore,
  useTasksStore,
  useTeamsStore,
  useTemplatesStore,
  useTimeEntriesStore,
  useExpensesStore,
  useInvoicesStore,
  useClientsStore,
  useMattersStore,
  useBillingRatesStore,
  useRateCardsStore,
  useActivityCodesStore,
  useBillingBudgetsStore,
  useTimesheetsStore,
  useExpenseReportsStore,
  usePaymentsStore,
  useTrustTransactionsStore,
  useFxQuotesStore,
  useBillingAuditRecordsStore,
  useBillingLocksStore,
  useReimbursementBatchesStore,
  useUsersStore,
  useWorkspaceInvitationsStore,
  useBillingInquiriesStore,
  useBundlesStore,
  useTeamJoinRequestsStore,
  useWorkspacesStore,
} from './entities'

type StoreHook = { getState: () => { hydrate: () => Promise<void> } }

const globalStores: StoreHook[] = [
  useWorkspacesStore,
  useNotificationsStore,
  usePendingEmailsStore,
]

const workspaceStores: StoreHook[] = [
  useTeamsStore,
  useUsersStore,
  useProjectsStore,
  useSectionsStore,
  useTasksStore,
  useCustomFieldsStore,
  useCommentsStore,
  useActivityStore,
  useAttachmentsStore,
  useTagsStore,
  useFormsStore,
  useFormSubmissionsStore,
  useRulesStore,
  useGoalsStore,
  usePortfoliosStore,
  useStatusUpdatesStore,
  useProjectMessagesStore,
  useSavedViewsStore,
  useDashboardsStore,
  useTemplatesStore,
  useBundlesStore,
  useWorkspaceInvitationsStore,
  useBillingInquiriesStore,
  useTeamJoinRequestsStore,
  useTimeEntriesStore,
  useExpensesStore,
  useInvoicesStore,
  useClientsStore,
  useMattersStore,
  useBillingRatesStore,
  useRateCardsStore,
  useActivityCodesStore,
  useBillingBudgetsStore,
  useTimesheetsStore,
  useExpenseReportsStore,
  usePaymentsStore,
  useTrustTransactionsStore,
  useFxQuotesStore,
  useBillingAuditRecordsStore,
  useBillingLocksStore,
  useReimbursementBatchesStore,
]

const allEntityStores = [...globalStores, ...workspaceStores]

/** Reload all entity stores from the active repository partition. */
export async function rehydrateEntityStores(): Promise<void> {
  await Promise.all(allEntityStores.map((store) => store.getState().hydrate()))
}

/** Reload user-global stores (workspaces list, notifications). */
export async function rehydrateGlobalStores(): Promise<void> {
  await getRepository().refreshSnapshot?.(null)
  const results = await Promise.allSettled(
    globalStores.map((store) => store.getState().hydrate())
  )
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('Tasklytic global store hydrate failed:', index, result.reason)
    }
  })
}

/** Reload workspace-scoped stores for the active workspace. */
export async function rehydrateWorkspaceStores(workspaceId?: string | null): Promise<void> {
  const wsId = workspaceId ?? useUiStore.getState().activeWorkspaceId
  setActiveRepositoryWorkspaceId(wsId)
  if (!wsId) return
  await getRepository().refreshSnapshot?.(wsId)
  const results = await Promise.allSettled(
    workspaceStores.map((store) => store.getState().hydrate())
  )
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('Tasklytic workspace store hydrate failed:', index, result.reason)
    }
  })
}

/** Hydrate repository and all Zustand stores once on app boot. */
export async function hydrateTasklytic(): Promise<void> {
  const repo = getRepository()
  await repo.migrateIfNeeded()
  registerActivityWriter({ add: (event) => useActivityStore.getState().add(event) })
  await useAuthStore.getState().hydrate()

  if (usesTasklyticBackend()) {
    await rehydrateGlobalStores()
    return
  }

  await rehydrateEntityStores()
}
