import type { Expense, Matter, TimeEntry } from '../../../types'

export type BillingSource = Pick<TimeEntry | Expense, 'matterId' | 'projectId'>

export function matterForBillingScope(scope: string, matters: Matter[]): Matter | undefined {
  if (!scope.startsWith('matter:')) return undefined
  return matters.find((matter) => matter.id === scope.slice(7))
}

export function matchesBillingScope(
  source: BillingSource,
  scope: string,
  matters: Matter[],
): boolean {
  if (scope === 'all') return true
  if (scope.startsWith('project:')) return source.projectId === scope.slice(8)

  const matter = matterForBillingScope(scope, matters)
  return Boolean(
    matter
    && (source.matterId === matter.id || source.projectId === matter.projectId),
  )
}
