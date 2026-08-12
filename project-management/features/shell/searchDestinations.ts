/** Nav destinations for command palette page group. */
export type SearchDestination = { label: string; segment: string; keywords?: string[] }

export const SEARCH_DESTINATIONS: SearchDestination[] = [
  { label: 'Home', segment: 'home' },
  { label: 'My Tasks', segment: 'my-tasks', keywords: ['tasks'] },
  { label: 'Inbox', segment: 'inbox', keywords: ['notifications'] },
  { label: 'Portfolios', segment: 'portfolios' },
  { label: 'Projects', segment: 'projects' },
  { label: 'Teams', segment: 'teams' },
  { label: 'My Searches', segment: 'my-searches', keywords: ['saved views', 'search'] },
  { label: 'Members', segment: 'members' },
  { label: 'Forms', segment: 'forms' },
  { label: 'Search', segment: 'search' },
  { label: 'Settings', segment: 'settings' },
  { label: 'Time tracking', segment: 'psa/time', keywords: ['psa', 'time'] },
  { label: 'Field library', segment: 'settings/fields', keywords: ['custom fields'] },
  { label: 'Integrations', segment: 'settings/integrations' },
]

export function filterDestinations(query: string, base: string): { label: string; href: string }[] {
  const q = query.trim().toLowerCase()
  return SEARCH_DESTINATIONS.filter((dest) => {
    if (!q) return true
    const haystack = [dest.label, dest.segment, ...(dest.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(q)
  }).map((dest) => ({ label: dest.label, href: `${base}/${dest.segment}` }))
}
