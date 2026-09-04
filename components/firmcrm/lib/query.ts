'use client'

import { useMemo } from 'react'
import { useQuery as query, useQueryClient as queryClient, type QueryClient } from '@tanstack/react-query'
import { useCrmContext } from './auth'
export { useMutation } from '@tanstack/react-query'

function useScope() {
  const { user, firm_id } = useCrmContext()
  return useMemo(() => ['firmcrm', user.id, firm_id] as const, [user.id, firm_id])
}
// Preserve TanStack's inference while adding the authenticated scope centrally.
export const useQuery: typeof query = ((options: Parameters<typeof query>[0]) => {
  const scope = useScope()
  return query({ ...options, queryKey: [...scope, ...options.queryKey] })
}) as typeof query

export function useQueryClient(): Pick<QueryClient, 'invalidateQueries'> {
  const client = queryClient()
  const scope = useScope()
  return useMemo(() => ({
    invalidateQueries: (filters, options) => client.invalidateQueries({ ...filters, queryKey: [...scope, ...(filters?.queryKey ?? [])] }, options),
  }), [client, scope])
}
