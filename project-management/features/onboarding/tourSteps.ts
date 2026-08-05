/** Route-aware product tour definitions for the complete Tasklytic module. */
import type { GuidedTourStep } from '@/components/tour/guided-tour'

export type TasklyticTourStep = GuidedTourStep & {
  route: string
  section: 'Start' | 'Work management' | 'Scale & automate' | 'Professional services' | 'Finish'
}

type TourStepOptions = {
  workspaceId: string
  projectId?: string
  taskId?: string
}

/**
 * Build absolute tour routes for the active workspace. Dynamic starter content is
 * used when it exists, while useful fallback pages keep the tour working in an
 * empty workspace.
 */
export function buildTourSteps({ workspaceId, projectId, taskId }: TourStepOptions): TasklyticTourStep[] {
  const base = `/dashboard/project-management/w/${workspaceId}`
  const projectRoute = projectId ? `${base}/projects/${projectId}?view=list` : `${base}/projects`
  const taskRoute = taskId ? `${base}/tasks/${taskId}` : projectRoute

  return [
    {
      id: 'welcome',
      route: `${base}/home`,
      section: 'Start',
      target: '[data-tour-page="home"]',
      title: 'Your Tasklytic workspace',
      body: 'Tasklytic brings projects, client delivery, team capacity, reporting, and billing into one connected workspace. This tour visits every major area.',
    },
    {
      id: 'navigation',
      route: `${base}/home`,
      section: 'Start',
      target: '[data-tour="sidebar"]',
      title: 'Move around your workspace',
      body: 'Use the sidebar to reach personal work, insights, professional services, and recent projects. Switch workspaces at the top and collapse or resize it whenever you need more room.',
    },
    {
      id: 'global-tools',
      route: `${base}/home`,
      section: 'Start',
      target: '[data-tour="topbar"]',
      title: 'Search, create, and stay current',
      body: 'The top bar gives you global search, quick creation, a running timer, notifications, themes, keyboard shortcuts, help, and account controls from every page.',
    },
    {
      id: 'projects',
      route: projectRoute,
      section: 'Work management',
      target: '[data-tour-page="projects"]',
      title: 'Projects and flexible views',
      body: 'Plan work in List, Board, Calendar, or Timeline/Gantt views. Add sections, milestones, dependencies, custom fields, filters, saved views, status updates, messages, files, and project briefs.',
    },
    {
      id: 'tasks',
      route: taskRoute,
      section: 'Work management',
      target: taskId ? '[data-tour-page="tasks"]' : '[data-tour-page="projects"]',
      title: 'Tasks hold the full story',
      body: 'Open any task to manage owners, dates, subtasks, dependencies, tags, custom fields, descriptions, attachments, time, expenses, threaded comments, mentions, followers, and activity.',
    },
    {
      id: 'my-tasks',
      route: `${base}/my-tasks`,
      section: 'Work management',
      target: '[data-tour-page="my-tasks"]',
      title: 'Focus in My Tasks',
      body: 'See everything assigned to you in List, Board, or Calendar form. Quick filters, Today and Upcoming sections, drag-and-drop planning, and unscheduled work keep the day manageable.',
    },
    {
      id: 'inbox',
      route: `${base}/inbox`,
      section: 'Work management',
      target: '[data-tour-page="inbox"]',
      title: 'Follow activity in Inbox',
      body: 'Review assignments, mentions, comments, approvals, and status changes. Filter, multi-select, archive, or snooze notifications and preview the related work without losing context.',
    },
    {
      id: 'search',
      route: `${base}/search`,
      section: 'Work management',
      target: '[data-tour-page="search"]',
      title: 'Find work across Tasklytic',
      body: 'Search tasks and projects across the workspace. Filters, sorting, grouping, and saved project views make repeatable perspectives easy to revisit.',
    },
    {
      id: 'forms',
      route: `${base}/forms`,
      section: 'Scale & automate',
      target: '[data-tour-page="forms"]',
      title: 'Standardize intake with Forms',
      body: 'Build public request forms with configurable fields and attachments. Every submission is captured and can create structured project work automatically.',
    },
    {
      id: 'rules',
      route: `${base}/rules`,
      section: 'Scale & automate',
      target: '[data-tour-page="rules"]',
      title: 'Automate routine work',
      body: 'Rules connect triggers, conditions, and actions. Start from a template, test a rule safely, review run history, and automate assignments, field changes, notifications, and recurring processes.',
    },
    {
      id: 'goals',
      route: `${base}/goals`,
      section: 'Scale & automate',
      target: '[data-tour-page="goals"]',
      title: 'Connect execution to Goals',
      body: 'Track company, team, and individual OKRs in a tree or list. Link child goals, roll up progress, publish updates, and filter by owner, status, or time frame.',
    },
    {
      id: 'portfolios',
      route: `${base}/portfolios`,
      section: 'Scale & automate',
      target: '[data-tour-page="portfolios"]',
      title: 'Monitor programs with Portfolios',
      body: 'Group related projects and review health, status, progress, workload, timelines, custom fields, dashboards, and update history at the program level.',
    },
    {
      id: 'workload',
      route: `${base}/workload`,
      section: 'Scale & automate',
      target: '[data-tour-page="workload"]',
      title: 'Balance team capacity',
      body: 'Workload turns assignments and estimates into a capacity heatmap. Adjust effort, account for time off, change date ranges, and catch overloaded or underused teammates early.',
    },
    {
      id: 'reporting',
      route: `${base}/reporting`,
      section: 'Scale & automate',
      target: '[data-tour-page="reporting"]',
      title: 'Build reporting dashboards',
      body: 'Create shareable dashboards with number, bar, line, donut, and lollipop charts. Filter the source data, drill into results, arrange the grid, export it, and schedule digest delivery.',
    },
    {
      id: 'templates',
      route: `${base}/templates`,
      section: 'Scale & automate',
      target: '[data-tour-page="templates"]',
      title: 'Start faster with Templates',
      body: 'Launch repeatable work from the industry template library, including accounting, legal, finance, HR, procurement, and transactions. You can also save and manage your own project and task templates.',
    },
    {
      id: 'ai',
      route: `${base}/home`,
      section: 'Scale & automate',
      target: '[data-tour="ai-sparkles"]',
      title: 'Work with Project Management AI',
      body: 'The AI assistant understands the current workspace, project, or task. Ask for summaries, status drafts, task plans, subtasks, and proposed updates—then review actions before applying them.',
    },
    {
      id: 'time',
      route: `${base}/psa/time`,
      section: 'Professional services',
      target: '[data-tour-page="time"]',
      title: 'Capture time and timesheets',
      body: 'Run a timer or enter time manually, review weekly utilization and billable value, submit timesheets, and manage approvals. Billing rates cascade from workspace, client, matter, project, and person settings.',
    },
    {
      id: 'expenses',
      route: `${base}/psa/expenses`,
      section: 'Professional services',
      target: '[data-tour-page="expenses"]',
      title: 'Track expenses end to end',
      body: 'Record receipts, mileage, reimbursements, pass-through costs, and billable markups. Group entries into expense reports and route them through approval.',
    },
    {
      id: 'clients-matters',
      route: `${base}/psa/clients`,
      section: 'Professional services',
      target: '[data-tour-page="clients"]',
      title: 'Organize clients and matters',
      body: 'Maintain client and matter records, engagement codes, budgets, fee arrangements, currencies, payment terms, rate cards, and the project work delivered for each relationship.',
    },
    {
      id: 'invoicing',
      route: `${base}/psa/invoicing`,
      section: 'Professional services',
      target: '[data-tour-page="invoicing"]',
      title: 'Turn approved work into invoices',
      body: 'Generate invoices from approved time and expenses, apply taxes and adjustments, track sent, partial, paid, overdue, or void states, record payments, and export to accounting systems.',
    },
    {
      id: 'trust',
      route: `${base}/psa/trust`,
      section: 'Professional services',
      target: '[data-tour-page="trust"]',
      title: 'Safeguard trust balances',
      body: 'Record client trust deposits and withdrawals, maintain an auditable transaction ledger, and spot low retainers that need a top-up before work continues.',
    },
    {
      id: 'psa-reports',
      route: `${base}/psa/reports`,
      section: 'Professional services',
      target: '[data-tour-page="psa-reports"]',
      title: 'Understand delivery economics',
      body: 'PSA reporting brings together WIP, utilization, realization, effective rates, profitability, and AR aging. The billing-rates tab lets administrators maintain the rate hierarchy behind those metrics.',
    },
    {
      id: 'people-admin',
      route: `${base}/members`,
      section: 'Finish',
      target: '[data-tour-page="members"]',
      title: 'Manage people and workspace settings',
      body: 'Invite members and guests, organize teams, assign roles, and control workspace access. Settings also cover workspace defaults, global custom fields, pending email, billing inquiries, and onboarding controls.',
    },
    {
      id: 'complete',
      route: `${base}/home`,
      section: 'Finish',
      target: '[data-tour-page="home"]',
      title: 'You have the full map',
      body: 'That is the complete Tasklytic workflow—from intake and planning through collaboration, automation, capacity, client delivery, billing, and reporting. Use Help → Product tour whenever you want a refresher.',
      nextLabel: 'Finish tour',
    },
  ]
}
