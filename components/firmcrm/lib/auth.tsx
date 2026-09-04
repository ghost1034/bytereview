'use client'

import { createContext, useContext } from 'react'
import type { components } from '@/lib/api-types'
import type { Role } from '@/components/firmcrm/api/types'

export type CrmContext = components['schemas']['FirmCrmContextOut']
export const CrmContext = createContext<CrmContext | null>(null)
const RANK: Record<Role, number> = { staff: 1, marketing: 1, manager: 2, partner: 3, admin: 4 }
export function useCrmContext() {
  const value = useContext(CrmContext)
  if (!value) throw new Error('FirmCRM provider is required')
  return value
}
export function useAuth() {
  const context = useCrmContext()
  const user = context.user
  return { user, loading: false, hasRole: (...roles: Role[]) => roles.includes(user.role as Role), atLeast: (role: Role) => (RANK[user.role as Role] ?? 0) >= RANK[role] }
}
