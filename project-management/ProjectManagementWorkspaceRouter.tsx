'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'

import { ProjectsIndex } from './ProjectsIndex'
import { TasklyticHome } from './TasklyticHome'
import { isInternalEvalEnabled } from './lib/evaluation/isInternalEvalEnabled'
import {
  canAccessInternalEvaluationRoute,
  isRemovedCustomerTrialRoute,
} from './lib/routePolicy'

const loading = () => <div className="rounded-lg border border-border bg-card text-card-foreground p-6 text-sm" role="status">Loading feature…</div>
const lazy = (loader: () => Promise<unknown>, name: string) => dynamic<Record<string, unknown>>(
  () => loader().then((module) => (module as Record<string, ComponentType<Record<string, unknown>>>)[name]), { loading },
)

const FieldLibraryPage = lazy(() => import('./features/custom-fields/FieldLibraryPage'), 'FieldLibraryPage')
const FormsPage = lazy(() => import('./features/forms/FormsPage'), 'FormsPage')
const GoalDetailPage = lazy(() => import('./features/goals/GoalDetailPage'), 'GoalDetailPage')
const GoalsPage = lazy(() => import('./features/goals/GoalsPage'), 'GoalsPage')
const InboxPage = lazy(() => import('./features/inbox/InboxPage'), 'InboxPage')
const MembersPage = lazy(() => import('./features/members/MembersPage'), 'MembersPage')
const PeoplePage = lazy(() => import('./features/people/PeoplePage'), 'PeoplePage')
const MyTasksPage = lazy(() => import('./features/my-tasks/MyTasksPage'), 'MyTasksPage')
const EvalTenantsPage = lazy(() => import('./features/onboarding/EvalTenantsPage'), 'EvalTenantsPage')
const PortfolioPage = lazy(() => import('./features/portfolios/PortfolioPage'), 'PortfolioPage')
const PortfoliosPage = lazy(() => import('./features/portfolios/PortfoliosPage'), 'PortfoliosPage')
const ProjectPage = lazy(() => import('./features/projects/ProjectPage'), 'ProjectPage')
const ClientsPage = lazy(() => import('./features/psa/ClientsPage'), 'ClientsPage')
const ExpensesPage = lazy(() => import('./features/psa/ExpensesPage'), 'ExpensesPage')
const InvoicingPage = lazy(() => import('./features/psa/InvoicingPage'), 'InvoicingPage')
const InvoiceDetailPage = lazy(() => import('./features/psa/invoicing/InvoiceDetailPage'), 'InvoiceDetailPage')
const MattersPage = lazy(() => import('./features/psa/MattersPage'), 'MattersPage')
const ReportsPage = lazy(() => import('./features/psa/ReportsPage'), 'ReportsPage')
const TimeTrackingPage = lazy(() => import('./features/psa/TimeTrackingPage'), 'TimeTrackingPage')
const TimesheetsPage = lazy(() => import('./features/psa/TimesheetsPage'), 'TimesheetsPage')
const TrustPage = lazy(() => import('./features/psa/trust/TrustPage'), 'TrustPage')
const DashboardPage = lazy(() => import('./features/reporting/DashboardPage'), 'DashboardPage')
const ReportingHomePage = lazy(() => import('./features/reporting/ReportingHomePage'), 'ReportingHomePage')
const RulesPage = lazy(() => import('./features/rules/RulesPage'), 'RulesPage')
const SearchPage = lazy(() => import('./features/search/SearchPage'), 'SearchPage')
const BillingInquiriesPage = lazy(() => import('./features/settings/BillingInquiriesPage'), 'BillingInquiriesPage')
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'), 'SettingsPage')
const IntegrationsSettingsPage = lazy(() => import('./features/settings/IntegrationsSettingsPage'), 'IntegrationsSettingsPage')
const ApprovalsSettingsPage = lazy(() => import('./features/settings/ApprovalsSettingsPage'), 'ApprovalsSettingsPage')
const BillingSettingsPage = lazy(() => import('./features/settings/BillingSettingsPage'), 'BillingSettingsPage')
const ClientDetailPage = lazy(() => import('./features/psa/clients/ClientDetailPage'), 'ClientDetailPage')
const MatterDetailPage = lazy(() => import('./features/psa/matters/MatterDetailPage'), 'MatterDetailPage')
const ExpenseReportDetailPage = lazy(() => import('./features/psa/expenses/ExpenseReportDetailPage'), 'ExpenseReportDetailPage')
const AiTeammatesSettingsPage = lazy(() => import('./features/ai/AiTeammatesSettingsPage'), 'AiTeammatesSettingsPage')
const TeamPage = lazy(() => import('./features/teams/TeamPage'), 'TeamPage')
const TeamSettingsPage = lazy(() => import('./features/teams/TeamSettingsPage'), 'TeamSettingsPage')
const TeamsNewPage = lazy(() => import('./features/teams/TeamsNewPage'), 'TeamsNewPage')
const TeamsPage = lazy(() => import('./features/teams/TeamsPage'), 'TeamsPage')
const TaskDetailPane = lazy(() => import('./features/tasks/TaskDetailPane'), 'TaskDetailPane')
const TemplatesPage = lazy(() => import('./features/templates/TemplatesPage'), 'TemplatesPage')
const WorkloadPage = lazy(() => import('./features/workload/WorkloadPage'), 'WorkloadPage')
const WorkspaceSettingsPage = lazy(() => import('./features/workspaces/WorkspaceSettingsPage'), 'WorkspaceSettingsPage')

type Props = {
  workspaceId: string
  segments?: string[]
}

/** Maps the module's workspace URLs to its feature pages without duplicating shell setup. */
export function ProjectManagementWorkspaceRouter({ workspaceId, segments = [] }: Props) {
  const [section = 'home', id, detail] = segments
  const basePath = `/dashboard/project-management/w/${workspaceId}`

  if (isRemovedCustomerTrialRoute(segments)) return <UnavailableRoute basePath={basePath} />

  if (section === 'home') return <TasklyticHome />
  if (section === 'my-tasks') return <MyTasksPage />
  if (section === 'inbox') return <InboxPage />

  if (section === 'projects') {
    return id ? <ProjectPage projectId={id} routeView={detail} /> : <ProjectsIndex />
  }
  if (section === 'tasks' && id) {
    return <TaskDetailPane workspaceId={workspaceId} taskId={id} mode="fullscreen" />
  }

  if (section === 'portfolios') {
    return id ? <PortfolioPage portfolioId={id} tab={detail} /> : <PortfoliosPage />
  }
  if (section === 'goals') {
    return id ? <GoalDetailPage goalId={id} workspaceId={workspaceId} /> : <GoalsPage />
  }
  if (section === 'forms') return <FormsPage />
  if (section === 'workload') return <WorkloadPage />
  if (section === 'templates') return <TemplatesPage />
  if (section === 'search' || section === 'my-searches') return <SearchPage />
  if (section === 'rules') return <RulesPage />
  if (section === 'members') return <MembersPage />
  if (section === 'people' && id) return <PeoplePage userId={id} />

  if (section === 'reporting') {
    return id ? (
      <DashboardPage workspaceId={workspaceId} dashboardId={id} basePath={basePath} />
    ) : (
      <ReportingHomePage />
    )
  }

  if (section === 'teams') {
    if (!id) return <TeamsPage />
    if (id === 'new') return <TeamsNewPage />
    return detail === 'settings' ? (
      <TeamSettingsPage teamId={id} />
    ) : (
      <TeamPage teamId={id} />
    )
  }

  if (section === 'settings') {
    if (id === 'billing') return <BillingSettingsPage />
    if (id === 'approvals') return <ApprovalsSettingsPage />
    if (id === 'ai-teammates') return <AiTeammatesSettingsPage />
    if (id === 'integrations') return <IntegrationsSettingsPage />
    if (id === 'workspace') return <WorkspaceSettingsPage />
    if (id === 'fields') return <FieldLibraryPage />
    if (id === 'billing-inquiries') return <BillingInquiriesPage />
    return <SettingsPage />
  }

  if (section === 'psa') {
    if (id === 'time') return <TimeTrackingPage />
    if (id === 'timesheets') return <TimesheetsPage />
    if (id === 'expenses' && detail === 'reports' && segments[3]) return <ExpenseReportDetailPage reportId={segments[3]} />
    if (id === 'expenses') return <ExpensesPage />
    if (id === 'clients' && detail) return <ClientDetailPage clientId={detail} />
    if (id === 'clients') return <ClientsPage />
    if ((id === 'matters' || id === 'engagements') && detail) return <MatterDetailPage matterId={detail} />
    if (id === 'matters' || id === 'engagements') return <MattersPage />
    if (id === 'invoicing' && detail) return <InvoiceDetailPage invoiceId={detail} />
    if (id === 'invoicing') return <InvoicingPage />
    if (id === 'trust') return <TrustPage />
    if (id === 'reports') return <ReportsPage />
  }

  if (canAccessInternalEvaluationRoute(segments, isInternalEvalEnabled())) {
    return <EvalTenantsPage />
  }

  return <UnavailableRoute basePath={basePath} />
}

function UnavailableRoute({ basePath }: { basePath: string }) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground mx-auto max-w-lg p-8 text-center shadow-sm">
      <h1 className="font-sans text-2xl">Page not found</h1>
      <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        This project-management destination is not available.
      </p>
      <Link className="mt-4 inline-block text-sm underline" href={`${basePath}/home`}>
        Return home
      </Link>
    </div>
  )
}
