/** Nav destinations for command palette page group. */
export type SearchDestination = { label: string; segment: string; keywords?: string[] }

export const SEARCH_DESTINATIONS: SearchDestination[] = [
  { label: 'Home', segment: 'home' },
  { label: 'My Tasks', segment: 'my-tasks', keywords: ['tasks'] },
  { label: 'Inbox', segment: 'inbox', keywords: ['notifications'] },
  { label: 'Reporting', segment: 'reporting', keywords: ['insights', 'dashboards'] },
  { label: 'Portfolios', segment: 'portfolios' },
  { label: 'Goals', segment: 'goals', keywords: ['okrs'] },
  { label: 'Projects', segment: 'projects' },
  { label: 'Teams', segment: 'teams' },
  { label: 'Members', segment: 'members' },
  { label: 'Forms', segment: 'forms' },
  { label: 'Workload', segment: 'workload' },
  { label: 'Templates', segment: 'templates' },
  { label: 'Rules', segment: 'rules', keywords: ['automation'] },
  { label: 'Search', segment: 'search' },
  { label: 'Settings', segment: 'settings' },
  { label: 'Time tracking', segment: 'psa/time', keywords: ['psa', 'time'] },
  { label: 'Expenses', segment: 'psa/expenses', keywords: ['psa'] },
  { label: 'Invoicing', segment: 'psa/invoicing', keywords: ['psa', 'billing'] },
  { label: 'Field library', segment: 'settings/fields', keywords: ['custom fields'] },
  { label: 'Pending emails', segment: 'settings/pending-emails' },
]

export function filterDestinations(query: string, base: string): { label: string; href: string }[] {
  const q = query.trim().toLowerCase()
  return SEARCH_DESTINATIONS.filter((dest) => {
    if (!q) return true
    const haystack = [dest.label, dest.segment, ...(dest.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(q)
  }).map((dest) => ({ label: dest.label, href: `${base}/${dest.segment}` }))
}
