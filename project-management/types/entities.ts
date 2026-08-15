/**
 * Tasklytic entity shapes — contract for all feature modules.
 * Additive extensions only; do not rename or remove fields.
 */
import type { ID, ISODate, ISODateTime } from './core'

export type UserTimeOff = {
  start: ISODate
  end: ISODate
  reason?: string
}

export type User = {
  id: ID
  name: string
  email: string
  avatarColor: string
  role: 'admin' | 'member' | 'guest' | 'ai'
  jobTitle?: string
  timezone?: string
  lastActiveAt?: ISODateTime
  starredProjectIds?: ID[]
  /** Weekly work capacity in hours (default 40). */
  capacityHoursPerWeek?: number
  /** Scheduled time off — reduces available capacity on those dates. */
  timeOff?: UserTimeOff[]
  onboarding?: {
    completed?: boolean
    completedSteps: string[]
    completedAt?: ISODateTime
    skippedAt?: ISODateTime
    tourCompletedAt?: ISODateTime
    /** Inline home checklist (step 29) — keyed by step id. */
    checklist?: Record<string, boolean>
  }
  defaultHourlyRate?: number
  timekeeperRole?: string
  defaultActivityCode?: string
  timekeeperId?: string
  roleFlags?: {
    canViewAllTime?: boolean
    canSubmit?: boolean
    canApprove?: boolean
    canBill?: boolean
    canRecordPayments?: boolean
    canManageTrust?: boolean
    canManageRates?: boolean
  }
  createdAt: ISODateTime
}

export type WorkspacePlanTier = 'free' | 'business' | 'enterprise'

export type WorkspacePlan = {
  tier: WorkspacePlanTier
  seatLimit: number
  renewsAt?: ISODate
}

export type Workspace = {
  id: ID
  name: string
  domain?: string
  iconEmoji?: string
  memberIds: ID[]
  adminIds: ID[]
  guestIds?: ID[]
  plan?: WorkspacePlan
  settings?: {
    autoApprovePrivateTeamJoinRequests?: boolean
    allowPublicForms?: boolean
  }
  profile?: {
    teamSize?: string
    /** Primary industry label (first selected); kept for backward compatibility. */
    industry?: string
    /** Up to three industry selections from onboarding. */
    industries?: string[]
    primaryUseCase?: string
    role?: string
    signedUpAt?: ISODateTime
  }
  /** ISO 4217 default for PSA billing. */
  defaultCurrency?: string
  timesheetPeriod?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
  timesheetWeekStart?: 'monday' | 'sunday'
  targetWeeklyHours?: number
  targetUtilizationPercent?: number
  requireTimeApproval?: boolean
  requireExpenseApproval?: boolean
  expenseReceiptRequiredAbove?: number
  approvalSettings?: {
    timeApproverIds?: ID[]
    expenseApproverIds?: ID[]
    invoiceApproverIds?: ID[]
    allowSelfApproval?: boolean
    requireSubmissionNotes?: boolean
  }
  mileageRate?: number
  invoicePrefix?: string
  invoiceStartNumber?: number
  invoiceNextNumber?: number
  billingSettings?: {
    defaultPaymentTerms?: Client['paymentTerms']
    defaultFooter?: string
    brandedHeader?: string
    invoiceApprovalRequired?: boolean
    invoiceApproverIds?: ID[]
    budgetWarningPercent?: number
    trustLowBalanceThreshold?: number
  }
  fxOverrides?: Record<string, { rate: number; effectiveOn: ISODate; note?: string }>
  psaMode?: 'legal' | 'accounting' | 'generic' | 'advisory'
  createdAt: ISODateTime
}

export type Team = {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  iconEmoji?: string
  memberIds: ID[]
  adminIds?: ID[]
  guestIds?: ID[]
  pinnedProjectIds?: ID[]
  privacy: 'public' | 'private' | 'secret'
}

export type ProjectView = 'list' | 'board' | 'calendar' | 'timeline' | 'gantt'
export type ProjectStatus = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete' | null

export type ProjectResource = {
  id: ID
  title: string
  url?: string
  dataUrl?: string
}

export type Project = {
  id: ID
  workspaceId: ID
  teamId: ID
  name: string
  description?: string
  notificationSettings?: {
    taskActivity: boolean
    statusUpdates: boolean
    newFiles: boolean
    mentions: boolean
  }
  iconEmoji?: string
  color: string
  privacy: 'public_to_team' | 'private_to_members' | 'public_to_workspace'
  memberIds: ID[]
  memberRoles?: Record<ID, string>
  keyResources?: ProjectResource[]
  attachmentIds?: ID[]
  ownerId: ID
  defaultView: ProjectView
  enabledViews: ProjectView[]
  status: ProjectStatus
  startOn?: ISODate
  dueOn?: ISODate
  archived: boolean
  isTemplate: boolean
  customFieldIds: ID[]
  sectionIds: ID[]
  taskOrderBySection?: Record<ID, ID[]>
  clientId?: ID
  matterId?: ID
  feeArrangement?: 'hourly' | 'flat_fee' | 'contingency' | 'hybrid' | 'retainer' | 'mixed'
  budgetHours?: number
  budgetAmount?: number
  rateCardId?: ID
  engagementCode?: string
  requireTimeTracking?: boolean
  requireExpenseTracking?: boolean
  useUtbms?: boolean
  trustEnabled?: boolean
  timeApprovalChain?: ID[]
  expenseApprovalChain?: ID[]
  createdAt: ISODateTime
  modifiedAt: ISODateTime
}

export type Section = {
  id: ID
  projectId: ID
  name: string
  order: number
  collapsed: boolean
  wipLimit?: number
}

export type TaskSubtype = 'default_task' | 'milestone' | 'approval'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested'

export type TaskEffort = {
  value: number
  unit: 'hours' | 'points'
}

export type CustomFieldValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number | null }
  | { type: 'date'; value: ISODate | null }
  | { type: 'people'; value: ID[] }
  | { type: 'dropdown'; value: ID | null }
  | { type: 'multi_select'; value: ID[] }
  | { type: 'formula'; value: number | string | null }
  | { type: 'checkbox'; value: boolean }

export type Task = {
  id: ID
  workspaceId: ID
  name: string
  notes?: string
  resourceSubtype: TaskSubtype
  completed: boolean
  completedAt?: ISODateTime
  completedById?: ID
  approvalStatus?: ApprovalStatus
  assigneeId?: ID
  collaboratorIds: ID[]
  /** Explicit effort estimate; falls back to Estimate custom field or defaults. */
  effort?: TaskEffort
  startOn?: ISODate
  dueOn?: ISODate
  dueAt?: ISODateTime
  parentId?: ID
  projectIds: ID[]
  sectionIdByProject: Record<ID, ID | undefined>
  tagIds: ID[]
  customFieldValues: Record<ID, CustomFieldValue>
  dependencyIds: ID[]
  dependentIds: ID[]
  attachmentIds: ID[]
  coverAttachmentId?: ID
  likedByIds: ID[]
  createdAt: ISODateTime
  modifiedAt: ISODateTime
}

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'people'
  | 'dropdown'
  | 'multi_select'
  | 'formula'
  | 'checkbox'

export type EnumOption = { id: ID; label: string; color: string }

export type CustomField = {
  id: ID
  workspaceId: ID
  name: string
  type: CustomFieldType
  description?: string
  isGlobal: boolean
  options?: EnumOption[]
  numberFormat?: 'plain' | 'percent' | 'currency'
  currencySymbol?: string
  notify: boolean
  createdBy: ID
  createdAt: ISODateTime
}

export type Comment = {
  id: ID
  taskId: ID
  authorId: ID
  bodyHtml: string
  mentionedUserIds: ID[]
  attachmentIds: ID[]
  reactions: Record<string, ID[]>
  isPinned: boolean
  createdAt: ISODateTime
  editedAt?: ISODateTime
}

export type ActivityEvent = {
  id: ID
  taskId?: ID
  projectId?: ID
  actorId: ID
  type:
    | 'task_created'
    | 'task_completed'
    | 'task_assigned'
    | 'task_unassigned'
    | 'due_date_changed'
    | 'project_added'
    | 'project_removed'
    | 'subtask_added'
    | 'dependency_added'
    | 'comment_added'
    | 'custom_field_changed'
    | 'attachment_added'
    | 'status_update_posted'
    | 'rule_action'
  details: Record<string, unknown>
  createdAt: ISODateTime
}

export type Attachment = {
  id: ID
  name: string
  size: number
  mime: string
  dataUrl?: string
  storageRef?: string
  storage: 'local' | 'object_store' | 'cloud_drive'
  uploadedBy: ID
  taskId?: ID
  commentId?: ID
  projectId?: ID
  createdAt: ISODateTime
}

export type Tag = {
  id: ID
  workspaceId: ID
  name: string
  color: string
}

export type FormVisibilityRule = { fieldId: ID; op: 'eq' | 'neq' | 'is_set' | 'is_not_set'; value?: unknown }

export type FormField = (
  | { id: ID; type: 'short_text'; label: string; required: boolean; placeholder?: string }
  | { id: ID; type: 'long_text'; label: string; required: boolean; placeholder?: string }
  | { id: ID; type: 'number'; label: string; required: boolean }
  | { id: ID; type: 'date'; label: string; required: boolean }
  | { id: ID; type: 'dropdown'; label: string; required: boolean; options: EnumOption[] }
  | { id: ID; type: 'multi_select'; label: string; required: boolean; options: EnumOption[] }
  | { id: ID; type: 'attachment'; label: string; required: boolean }
) & { visibleIf?: FormVisibilityRule }

export type Form = {
  id: ID
  projectId: ID
  name: string
  description?: string
  fields: FormField[]
  defaultAssigneeId?: ID
  defaultSectionId?: ID
  taskTitleFieldId?: ID
  copyAnswersToDescription: boolean
  isPublic: boolean
  accessMode?: 'public' | 'workspace'
  publicSlug?: string
  confirmationMessage: string
  branding?: { coverImageDataUrl?: string; logoDataUrl?: string }
  createdAt: ISODateTime
}

export type FormSubmission = {
  id: ID
  formId: ID
  answers: Record<ID, unknown>
  submittedBy?: ID
  taskId?: ID
  createdAt: ISODateTime
}

export type RuleTrigger =
  | { type: 'task_added_to_project' }
  | { type: 'task_moved_to_section'; sectionId: ID }
  | { type: 'task_completed' }
  | { type: 'task_due_in_days'; days: number }
  | { type: 'custom_field_changed'; customFieldId: ID; toValue?: unknown }
  | { type: 'form_submitted'; formId: ID }

export type RuleAction =
  | { type: 'assign_to'; userId: ID }
  | { type: 'set_due_in_days'; days: number }
  | { type: 'move_to_section'; sectionId: ID }
  | { type: 'add_to_project'; projectId: ID }
  | { type: 'set_custom_field'; customFieldId: ID; value: unknown }
  | { type: 'add_collaborator'; userId: ID }
  | { type: 'send_notification'; userId: ID; message: string }
  | { type: 'create_subtask'; templateName: string }
  | { type: 'send_email'; recipient: ID | 'assignee'; subject: string; body: string }

export type Rule = {
  id: ID
  projectId: ID
  name: string
  enabled: boolean
  trigger: RuleTrigger
  conditions: Array<{ field: string; op: 'eq' | 'neq' | 'gt' | 'lt' | 'in'; value: unknown }>
  actions: RuleAction[]
  runCount: number
  lastRunAt?: ISODateTime
  createdBy: ID
  createdAt: ISODateTime
  /** Tracks bundle-owned rules so unapply can remove configuration without deleting work. */
  sourceBundleId?: ID
}

export type Goal = {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  ownerId: ID
  parentGoalId?: ID
  timeFrame: { start: ISODate; end: ISODate }
  metric:
    | { type: 'percent'; current: number; target: 100 }
    | { type: 'numeric'; current: number; target: number; unit?: string }
    | { type: 'currency'; current: number; target: number; symbol: string }
    | { type: 'manual'; status: 'on_track' | 'at_risk' | 'off_track' }
  status: 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed' | 'dropped'
  supportingProjectIds: ID[]
  supportingGoalIds: ID[]
  /** Weight used when this goal rolls into a parent; defaults to 1. */
  rollupWeight?: number
  /** Optional weights for explicitly linked supporting goals/projects. */
  supportingGoalWeights?: Record<ID, number>
  supportingProjectWeights?: Record<ID, number>
  privacy: 'public' | 'members_only'
  createdAt: ISODateTime
}

export type Portfolio = {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  ownerId: ID
  projectIds: ID[]
  goalIds: ID[]
  customFieldIds: ID[]
  status: ProjectStatus
  createdAt: ISODateTime
}

export type StatusUpdate = {
  id: ID
  scope: { type: 'project' | 'portfolio' | 'goal'; id: ID }
  authorId: ID
  status: 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete'
  title: string
  summaryHtml: string
  highlightsHtml?: string
  blockersHtml?: string
  nextStepsHtml?: string
  createdAt: ISODateTime
}

/** Thread comment embedded on a project message (same shape as task comments minus taskId). */
export type ProjectMessageComment = {
  id: ID
  authorId: ID
  bodyHtml: string
  mentionedUserIds: ID[]
  attachmentIds: ID[]
  reactions: Record<string, ID[]>
  isPinned: boolean
  createdAt: ISODateTime
  editedAt?: ISODateTime
}

/** Project-scoped broadcast message with optional announcement pin. */
export type ProjectMessage = {
  id: ID
  projectId: ID
  authorId: ID
  recipientType: 'project_members' | 'team' | 'workspace'
  audienceIds: ID[]
  title: string
  bodyHtml: string
  isAnnouncement: boolean
  attachmentIds: ID[]
  reactions: Record<string, ID[]>
  comments: ProjectMessageComment[]
  createdAt: ISODateTime
  editedAt?: ISODateTime
}

export type Notification = {
  id: ID
  userId: ID
  actorId?: ID
  type:
    | 'mention'
    | 'assigned'
    | 'due_soon'
    | 'comment_on_task'
    | 'status_update'
    | 'project_message'
    | 'rule_action'
    | 'form_submission'
    | 'approval_request'
    | 'team_join_request'
  scope: { type: 'task' | 'project' | 'portfolio' | 'goal' | 'form' | 'team'; id: ID }
  message: string
  unread: boolean
  archived: boolean
  snoozedUntil?: ISODateTime
  metadata?: Record<string, unknown>
  createdAt: ISODateTime
}

export type TeamJoinRequest = {
  id: ID
  workspaceId: ID
  teamId: ID
  userId: ID
  status: 'pending' | 'approved' | 'rejected'
  reviewedById?: ID
  reviewedAt?: ISODateTime
  createdAt: ISODateTime
}

export type BillingInquiry = {
  id: ID
  workspaceId: ID
  userId: ID
  type: 'upgrade' | 'manage_payment'
  message?: string
  status: 'open' | 'closed'
  createdAt: ISODateTime
}

export type SavedView = {
  id: ID
  ownerScope: { type: 'project' | 'portfolio' | 'search'; id: ID }
  name: string
  viewType: ProjectView | 'chart'
  filters: Array<{ field: string; op: string; value: unknown }>
  filterExpression?: import('../lib/query/types').FilterGroup
  query?: import('../lib/query/types').ViewQuery
  scope?: { type: 'workspace' | 'team' | 'portfolio' | 'project'; id?: ID }
  ownership?: 'personal' | 'workspace'
  pinned?: boolean
  groupBy?: string
  sortBy?: { field: string; direction: 'asc' | 'desc' }
  hiddenFields: string[]
  createdBy: ID
}

export type ChartType = 'bar' | 'column' | 'line' | 'donut' | 'lollipop' | 'number' | 'burnup'

export type Chart = {
  id: ID
  title: string
  type: ChartType
  source: 'tasks' | 'projects' | 'portfolios' | 'goals' | 'time' | 'expenses' | 'utilization' | 'wip' | 'invoices' | 'payments' | 'realization' | 'effective_rate' | 'ar_aging'
  filters: SavedView['filters']
  xAxis?: string
  yAxis?: string
  measure: 'count' | 'sum' | 'avg'
  measureField?: string
  dateField?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter'
  topN?: 5 | 10 | 25 | 50
}

export type Dashboard = {
  id: ID
  workspaceId: ID
  name: string
  ownerId: ID
  charts: Chart[]
  layout: Array<{ chartId: ID; x: number; y: number; w: number; h: number }>
  sharedWith: ID[]
  viewerIds?: ID[]
  editorIds?: ID[]
  visibility?: 'private' | 'people' | 'workspace'
  createdAt: ISODateTime
}

export type TaskTemplate = {
  id: ID
  name: string
  defaults: Partial<Task>
  subtaskTemplates: TaskTemplate[]
}

export type ProjectTemplate = {
  id: ID
  name: string
  description?: string
  defaults: Partial<Project>
  sectionNames: string[]
  taskTemplates: TaskTemplate[]
  customFieldIds: ID[]
  iconEmoji?: string
  workspaceId?: ID
  createdBy?: ID
  ruleTemplates?: Array<Omit<Rule, 'id' | 'projectId' | 'createdBy' | 'createdAt'>>
}

export type Bundle = {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  iconEmoji?: string
  customFieldIds: ID[]
  sectionNames: string[]
  taskTemplates: TaskTemplate[]
  ruleTemplates: Array<Omit<Rule, 'id' | 'projectId' | 'createdBy' | 'createdAt'>>
  appliedToProjectIds: ID[]
  createdBy: ID
  createdAt: ISODateTime
}

export type Session = {
  id?: ID
  revision?: number
  currentUserId: ID | null
  partition?: 'default' | `eval:${string}`
}

export type WorkspaceInvitation = {
  id: ID
  revision?: number
  workspaceId: ID
  email: string
  role: 'admin' | 'member' | 'guest'
  invitedById: ID
  teamId?: ID
  note?: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  token: string
  expiresAt: ISODateTime
  createdAt: ISODateTime
}

export type PendingEmail = {
  id: ID
  workspaceId?: ID
  to: string
  subject: string
  bodyHtml: string
  bodyText?: string
  category: 'invite' | 'password_reset' | 'notification' | 'digest' | 'other'
  metadata?: Record<string, unknown>
  createdAt: ISODateTime
}

export type TimeEntryStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'billed'
  | 'written_off'

export type RateSource =
  | 'user_default'
  | 'role'
  | 'team'
  | 'workspace'
  | 'project'
  | 'matter'
  | 'client'
  | 'override'

export type TimeEntry = {
  id: ID
  workspaceId: ID
  userId: ID
  projectId?: ID
  taskId?: ID
  matterId?: ID
  clientId?: ID
  description: string
  hours: number
  durationMinutes?: number
  date: ISODate
  startedAt?: ISODateTime
  stoppedAt?: ISODateTime
  billable: boolean
  rateSnapshot?: number
  rateSource?: RateSource
  currency?: string
  amount?: number
  activityCode?: string
  taskCode?: string
  status?: TimeEntryStatus
  approved?: boolean
  invoiced?: boolean
  timesheetId?: ID
  submittedAt?: ISODateTime
  approvedById?: ID
  approvedAt?: ISODateTime
  rejectedReason?: string
  invoiceId?: ID
  writeOffReason?: string
  createdAt: ISODateTime
  modifiedAt?: ISODateTime
}

export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'reimbursed'
  | 'billed'
  | 'written_off'

export type ExpenseCategory =
  | 'travel_air'
  | 'travel_lodging'
  | 'travel_ground'
  | 'meals_client'
  | 'meals_team'
  | 'supplies'
  | 'third_party'
  | 'filing_fees'
  | 'court_fees'
  | 'expert_fees'
  | 'witness_fees'
  | 'service_fees'
  | 'process_server'
  | 'copies'
  | 'postage_shipping'
  | 'telecom'
  | 'software_subscriptions'
  | 'training_cpe'
  | 'mileage'
  | 'parking_tolls'
  | 'other'

export type Expense = {
  id: ID
  workspaceId: ID
  userId: ID
  taskId?: ID
  projectId?: ID
  matterId?: ID
  clientId?: ID
  description: string
  amount: number
  category: string
  date: ISODate
  billable: boolean
  receiptUrl?: string
  vendor?: string
  taxAmount?: number
  totalAmount?: number
  currency?: string
  paymentMethod?: 'corporate_card' | 'personal' | 'cash' | 'wire' | 'check' | 'ach'
  receiptAttachmentId?: ID
  manualReceipt?: {
    vendor?: string
    date?: ISODate
    subtotal?: number
    tax?: number
    total?: number
    currency?: string
    notes?: string
    enteredById?: ID
    enteredAt?: ISODateTime
  }
  passThrough?: boolean
  markupPercent?: number
  billableAmount?: number
  reimbursable?: boolean
  mileageMiles?: number
  mileageRate?: number
  status?: ExpenseStatus
  approved?: boolean
  invoiced?: boolean
  expenseReportId?: ID
  submittedAt?: ISODateTime
  approvedById?: ID
  approvedAt?: ISODateTime
  rejectedReason?: string
  reimbursedAt?: ISODateTime
  invoiceId?: ID
  writeOffReason?: string
  createdAt: ISODateTime
  modifiedAt?: ISODateTime
}

export type BillingRateScope =
  | 'user_default'
  | 'role'
  | 'team'
  | 'workspace'
  | 'client'
  | 'project'
  | 'matter'

export type BillingRate = {
  id: ID
  workspaceId: ID
  scope: BillingRateScope
  scopeId?: ID
  role?: string
  userId?: ID
  hourlyRate: number
  currency: string
  effectiveFrom: ISODate
  effectiveTo?: ISODate
  notes?: string
  createdAt: ISODateTime
}

export type RateCard = {
  id: ID
  workspaceId: ID
  name: string
  description?: string
  rates: BillingRate[]
  currency: string
  effectiveFrom: ISODate
  effectiveTo?: ISODate
}

export type ActivityCode = {
  id: ID
  workspaceId: ID
  code: string
  name: string
  category?: string
  active: boolean
  createdAt: ISODateTime
}

export type BillingBudget = {
  id: ID
  workspaceId: ID
  scope: 'client' | 'matter' | 'project'
  scopeId: ID
  currency: string
  amount?: number
  hours?: number
  warningPercent?: number
  effectiveFrom: ISODate
  effectiveTo?: ISODate
  createdAt: ISODateTime
}

export type Client = {
  id: ID
  workspaceId: ID
  name: string
  type: 'individual' | 'business' | 'nonprofit' | 'government'
  industry?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  fiscalYearEnd?: string
  billingAddress?: string
  taxId?: string
  paymentTerms: 'due_on_receipt' | 'net_15' | 'net_30' | 'net_45' | 'net_60'
  defaultRateCardId?: ID
  defaultCurrency: string
  retainerBalance?: number
  notes?: string
  archived: boolean
  createdAt: ISODateTime
}

export type Matter = {
  id: ID
  workspaceId: ID
  projectId: ID
  clientId: ID
  matterNumber: string
  practiceArea: string
  responsibleAttorneyId: ID
  originatingAttorneyId: ID
  feeArrangement: 'hourly' | 'flat_fee' | 'contingency' | 'hybrid' | 'retainer'
  flatFeeAmount?: number
  contingencyPercent?: number
  budgetHours?: number
  budgetAmount?: number
  rateCardId?: ID
  utbmsEnabled?: boolean
  trustEnabled?: boolean
  openedAt: ISODate
  closedAt?: ISODate
  status: 'active' | 'on_hold' | 'closed' | 'collections'
  conflictStatus: 'cleared' | 'pending' | 'waivable' | 'conflict'
}

export type Timesheet = {
  id: ID
  workspaceId: ID
  userId: ID
  periodStart: ISODate
  periodEnd: ISODate
  status: 'draft' | 'submitted' | 'approved' | 'partially_approved' | 'rejected' | 'locked'
  totalHours: number
  billableHours: number
  nonBillableHours: number
  totalAmount: number
  utilizationPercent: number
  targetHours: number
  submittedAt?: ISODateTime
  approvedById?: ID
  approvedAt?: ISODateTime
  rejectedReason?: string
  notes?: string
}

export type ExpenseReport = {
  id: ID
  workspaceId: ID
  userId: ID
  name: string
  expenseIds: ID[]
  status: 'draft' | 'submitted' | 'approved' | 'partially_approved' | 'rejected' | 'reimbursed'
  totalAmount: number
  reimbursableAmount: number
  currency: string
  submittedAt?: ISODateTime
  approvedById?: ID
  approvedAt?: ISODateTime
  rejectedReason?: string
  reimbursedAt?: ISODateTime
  reimbursementMethod?: 'payroll' | 'ach' | 'check'
  reimbursementReference?: string
  partialApproval?: { approvedIds: ID[]; rejectedIds: ID[]; reason: string }
}

export type InvoiceLineItem = {
  id?: ID
  description: string
  quantity: number
  rate: number
  amount?: number
  currency?: string
  type?: 'time' | 'expense' | 'fee'
  sourceId?: ID
  sourceCurrency?: string
  fxQuoteId?: ID
  writtenOff?: boolean
  writeOffReason?: string
}

export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'paid'
  | 'partial'
  | 'overdue'
  | 'void'
  | 'written_off'

export type Invoice = {
  id: ID
  workspaceId: ID
  clientName: string
  clientId?: ID
  matterId?: ID
  projectIds?: ID[]
  matterIds?: ID[]
  invoiceNumber: string
  issueDate?: ISODate
  status: InvoiceStatus | 'draft' | 'sent' | 'paid' | 'void'
  amount: number
  dueOn: ISODate
  periodStart?: ISODate
  periodEnd?: ISODate
  timeEntryIds?: ID[]
  expenseIds?: ID[]
  subtotalFees?: number
  subtotalExpenses?: number
  discountAmount?: number
  discountReason?: string
  taxAmount?: number
  total?: number
  amountPaid?: number
  amountOutstanding?: number
  trustApplied?: number
  currency?: string
  notes?: string
  footer?: string
  narrative?: string
  lineItems: InvoiceLineItem[]
  deliveryHistory?: Array<{
    id: ID
    method: 'email' | 'mail' | 'pdf' | 'manual'
    recipient?: string
    status: 'recorded' | 'queued' | 'sent' | 'failed'
    sentAt: ISODateTime
    sentById: ID
    resendOfId?: ID
  }>
  pdfSha256?: string
  pdfGeneratedAt?: ISODateTime
  submittedAt?: ISODateTime
  approvedAt?: ISODateTime
  approvedById?: ID
  writtenOffAt?: ISODateTime
  writtenOffReason?: string
  fxQuoteId?: ID
  fxQuoteIds?: ID[]
  baseCurrency?: string
  baseCurrencyTotal?: number
  sentAt?: ISODateTime
  paidAt?: ISODateTime
  voidedAt?: ISODateTime
  voidedReason?: string
  createdAt: ISODateTime
  createdById?: ID
}

export type Payment = {
  id: ID
  workspaceId: ID
  invoiceId?: ID
  clientId?: ID
  matterId?: ID
  amount: number
  currency: string
  method: 'check' | 'ach' | 'wire' | 'card' | 'trust_application' | 'trust_deposit' | 'other'
  reference?: string
  paidAt: ISODate
  recordedById: ID
  createdAt: ISODateTime
  status?: 'posted' | 'reversed' | 'reversal'
  reversedAt?: ISODateTime
  reversedById?: ID
  reversalPaymentId?: ID
  originalPaymentId?: ID
  reversalReason?: string
  trustTransactionId?: ID
}

export type TrustTransaction = {
  id: ID
  workspaceId: ID
  clientId: ID
  matterId?: ID
  type: 'deposit' | 'withdrawal' | 'application' | 'reversal'
  amount: number
  currency: string
  balanceAfter: number
  signedAmount?: number
  invoiceId?: ID
  reference?: string
  notes?: string
  recordedById: ID
  createdAt: ISODateTime
  originalTransactionId?: ID
  reversedAt?: ISODateTime
  reversedById?: ID
  reversalTransactionId?: ID
  reversalReason?: string
}

export type FxQuote = {
  id: ID
  workspaceId: ID
  baseCurrency: string
  quoteCurrency: string
  rate: number
  rateDate: ISODate
  requestedRateDate?: ISODate
  source: 'ecb' | 'workspace_override'
  createdAt: ISODateTime
}

export type BillingAuditRecord = {
  id: ID
  workspaceId: ID
  resourceType: 'invoice' | 'payment' | 'trust' | 'fx' | 'rate' | 'budget'
  resourceId: ID
  action: string
  actorId: ID
  at: ISODateTime
  details?: Record<string, unknown>
}

export type BillingLock = {
  id: ID
  workspaceId: ID
  sourceKind: 'timeEntries' | 'expenses'
  sourceId: ID
  invoiceId: ID
  status: 'active' | 'released'
  createdAt: ISODateTime
  releasedAt?: ISODateTime
}

export type ReimbursementBatch = {
  id: ID
  workspaceId: ID
  expenseReportIds: ID[]
  totalAmount: number
  method: 'payroll' | 'ach' | 'check'
  reference?: string
  paidAt: ISODate
}

export type IntegrationProvider = 'google_drive' | 'vertex_receipts' | 'gmail' | 'gcs' | 'stripe_connect'

export type IntegrationCapability = {
  provider: IntegrationProvider
  status: 'active' | 'degraded' | 'revoked' | 'disabled'
  available: boolean
  capability: Record<string, unknown>
  revision: number
  lastError?: { code: string; detail?: string } | null
}

export type ExternalReference = {
  id: ID
  workspaceId: ID
  provider: IntegrationProvider
  resourceType: string
  externalId: string
  localKind: string
  localId: ID
  syncStatus: 'pending' | 'synchronized' | 'partial' | 'failed' | 'conflict'
  externalVersion?: string
  revision: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
