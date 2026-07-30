'use client'

import Link from 'next/link'

import { ProjectsIndex } from './ProjectsIndex'
import { TasklyticHome } from './TasklyticHome'
import { FieldLibraryPage } from './features/custom-fields/FieldLibraryPage'
import { FormsPage } from './features/forms/FormsPage'
import { GoalDetailPage } from './features/goals/GoalDetailPage'
import { GoalsPage } from './features/goals/GoalsPage'
import { InboxPage } from './features/inbox/InboxPage'
import { MembersPage } from './features/members/MembersPage'
import { MyTasksPage } from './features/my-tasks/MyTasksPage'
import { EvalTenantsPage } from './features/onboarding/EvalTenantsPage'
import { PortfolioPage } from './features/portfolios/PortfolioPage'
import { PortfoliosPage } from './features/portfolios/PortfoliosPage'
import { ProjectPage } from './features/projects/ProjectPage'
import { ClientsPage } from './features/psa/ClientsPage'
import { ExpensesPage } from './features/psa/ExpensesPage'
import { InvoicingPage } from './features/psa/InvoicingPage'
import { MattersPage } from './features/psa/MattersPage'
import { ReportsPage } from './features/psa/ReportsPage'
import { TimeTrackingPage } from './features/psa/TimeTrackingPage'
import { TimesheetsPage } from './features/psa/TimesheetsPage'
import { TrustPage } from './features/psa/trust/TrustPage'
import { DashboardPage } from './features/reporting/DashboardPage'
import { ReportingHomePage } from './features/reporting/ReportingHomePage'
import { RulesPage } from './features/rules/RulesPage'
import { SearchPage } from './features/search/SearchPage'
import { BillingInquiriesPage } from './features/settings/BillingInquiriesPage'
import { PendingEmailsPage } from './features/settings/PendingEmailsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TeamPage } from './features/teams/TeamPage'
import { TeamSettingsPage } from './features/teams/TeamSettingsPage'
import { TeamsNewPage } from './features/teams/TeamsNewPage'
import { TeamsPage } from './features/teams/TeamsPage'
import { TaskDetailPane } from './features/tasks/TaskDetailPane'
import { TemplatesPage } from './features/templates/TemplatesPage'
import { WorkloadPage } from './features/workload/WorkloadPage'
import { WorkspaceSettingsPage } from './features/workspaces/WorkspaceSettingsPage'

type Props = {
  workspaceId: string
  segments?: string[]
}

/** Maps the module's workspace URLs to its feature pages without duplicating shell setup. */
export function ProjectManagementWorkspaceRouter({ workspaceId, segments = [] }: Props) {
  const [section = 'home', id, detail] = segments
  const basePath = `/dashboard/project-management/w/${workspaceId}`

  if (section === 'home') return <TasklyticHome />
  if (section === 'my-tasks') return <MyTasksPage />
  if (section === 'inbox') return <InboxPage />

  if (section === 'projects') {
    return id ? <ProjectPage projectId={id} /> : <ProjectsIndex />
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
  if (section === 'search') return <SearchPage />
  if (section === 'rules') return <RulesPage />
  if (section === 'members') return <MembersPage />

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
    if (id === 'workspace') return <WorkspaceSettingsPage />
    if (id === 'fields') return <FieldLibraryPage />
    if (id === 'pending-emails') return <PendingEmailsPage />
    if (id === 'billing-inquiries') return <BillingInquiriesPage />
    return <SettingsPage />
  }

  if (section === 'psa') {
    if (id === 'time') return <TimeTrackingPage />
    if (id === 'timesheets') return <TimesheetsPage />
    if (id === 'expenses') return <ExpensesPage />
    if (id === 'clients') return <ClientsPage />
    if (id === 'matters') return <MattersPage />
    if (id === 'invoicing') return <InvoicingPage />
    if (id === 'trust') return <TrustPage />
    if (id === 'reports') return <ReportsPage />
  }

  if (section === 'internal' && id === 'eval') return <EvalTenantsPage />

  return (
    <div className="tl-card mx-auto max-w-lg p-8 text-center shadow-paper-sm">
      <h1 className="font-serif text-2xl">Page not found</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
        This project-management destination is not available.
      </p>
      <Link className="mt-4 inline-block text-sm underline" href={`${basePath}/home`}>
        Return home
      </Link>
    </div>
  )
}
