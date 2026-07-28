import { createEntityStore } from './createEntityStore'
import type {
  ActivityEvent,
  Attachment,
  BillingRate,
  Client,
  Comment,
  CustomField,
  Dashboard,
  Expense,
  ExpenseReport,
  Form,
  FormSubmission,
  Goal,
  Invoice,
  Matter,
  Notification,
  Payment,
  Portfolio,
  Project,
  ProjectTemplate,
  RateCard,
  ReimbursementBatch,
  Rule,
  SavedView,
  Section,
  StatusUpdate,
  ProjectMessage,
  Tag,
  Task,
  Team,
  TimeEntry,
  Timesheet,
  TrustTransaction,
  User,
  Workspace,
  BillingInquiry,
  TeamJoinRequest,
  WorkspaceInvitation,
  PendingEmail,
} from '../types'

export const useWorkspacesStore = createEntityStore<Workspace>('workspaces')
export const useTeamsStore = createEntityStore<Team>('teams')
export const useUsersStore = createEntityStore<User>('users')
export const useProjectsStore = createEntityStore<Project>('projects')
export const useSectionsStore = createEntityStore<Section>('sections')
export const useTasksStore = createEntityStore<Task>('tasks')
export const useCustomFieldsStore = createEntityStore<CustomField>('customFields')
export const useCommentsStore = createEntityStore<Comment>('comments')
export const useActivityStore = createEntityStore<ActivityEvent>('activity')
export const useAttachmentsStore = createEntityStore<Attachment>('attachments')
export const useTagsStore = createEntityStore<Tag>('tags')
export const useFormsStore = createEntityStore<Form>('forms')
export const useFormSubmissionsStore = createEntityStore<FormSubmission>('formSubmissions')
export const useRulesStore = createEntityStore<Rule>('rules')
export const useGoalsStore = createEntityStore<Goal>('goals')
export const usePortfoliosStore = createEntityStore<Portfolio>('portfolios')
export const useStatusUpdatesStore = createEntityStore<StatusUpdate>('statusUpdates')
export const useProjectMessagesStore = createEntityStore<ProjectMessage>('projectMessages')
export const useNotificationsStore = createEntityStore<Notification>('notifications')
export const useSavedViewsStore = createEntityStore<SavedView>('savedViews')
export const useDashboardsStore = createEntityStore<Dashboard>('dashboards')
export const useTemplatesStore = createEntityStore<ProjectTemplate>('templates')
export const usePendingEmailsStore = createEntityStore<PendingEmail>('pendingEmails')
export const useWorkspaceInvitationsStore = createEntityStore<WorkspaceInvitation>('workspaceInvitations')
export const useBillingInquiriesStore = createEntityStore<BillingInquiry>('billingInquiries')
export const useTeamJoinRequestsStore = createEntityStore<TeamJoinRequest>('teamJoinRequests')
export const useTimeEntriesStore = createEntityStore<TimeEntry>('timeEntries')
export const useExpensesStore = createEntityStore<Expense>('expenses')
export const useInvoicesStore = createEntityStore<Invoice>('invoices')
export const useClientsStore = createEntityStore<Client>('clients')
export const useMattersStore = createEntityStore<Matter>('matters')
export const useBillingRatesStore = createEntityStore<BillingRate>('billingRates')
export const useRateCardsStore = createEntityStore<RateCard>('rateCards')
export const useTimesheetsStore = createEntityStore<Timesheet>('timesheets')
export const useExpenseReportsStore = createEntityStore<ExpenseReport>('expenseReports')
export const usePaymentsStore = createEntityStore<Payment>('payments')
export const useTrustTransactionsStore = createEntityStore<TrustTransaction>('trustTransactions')
export const useReimbursementBatchesStore = createEntityStore<ReimbursementBatch>('reimbursementBatches')
