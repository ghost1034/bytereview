/** Product tour step definitions — anchored tooltips across the shell. */
import type { GuidedTourStep } from '@/components/tour/guided-tour'

export const TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation',
    body: 'Switch workspaces, jump to your favorites, and find anything fast.',
  },
  {
    id: 'my-tasks',
    target: '[data-tour="my-tasks"]',
    title: 'My Tasks',
    body: 'Your day starts here. Today, Upcoming, and Later sections keep you focused.',
  },
  {
    id: 'project-tabs',
    target: '#topbar-tabs',
    title: 'Project views',
    body: 'Five ways to see your work — pick whichever fits the moment.',
  },
  {
    id: 'task-detail',
    target: '[data-tour="task-detail"]',
    title: 'Task detail',
    body: 'Everything about a task in one place: assignees, dates, dependencies, time, expenses.',
  },
  {
    id: 'ai-panel',
    target: '[data-tour="ai-sparkles"]',
    title: 'Project Management AI',
    body: 'Project Management AI drafts updates, suggests subtasks, and writes status posts for you.',
  },
  {
    id: 'reporting',
    target: '[data-tour="reporting"]',
    title: 'Reporting',
    body: 'Build dashboards from anywhere in the platform.',
  },
]
