'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnalyticsFirmGate } from '@/components/analytics/AnalyticsFirmGate'
import { useAuth } from '@/contexts/AuthContext'
import { CrmContext, type CrmContext as Context } from './lib/auth'
import { get } from './api/client'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/Confirm'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import Shell from './components/layout/Shell'

function Workspace({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const pathname = usePathname()
  const context = useQuery({ queryKey: ['firmcrm-context', user?.uid], queryFn: () => get<Context>('/context'), enabled: !!user, staleTime: 0, refetchInterval: 30_000, retry: false })
  const scope = context.data ? ['firmcrm', user?.uid, context.data.firm_id] : ['firmcrm', user?.uid]
  const fingerprint = JSON.stringify(context.data)
  const refetchContext = context.refetch
  useEffect(() => {
    // Revoke cached visibility after role/settings changes and any module mutation.
    const changed = () => { void client.invalidateQueries({ queryKey: ['firmcrm', user?.uid] }); void refetchContext() }
    window.addEventListener('firmcrm:changed', changed)
    return () => window.removeEventListener('firmcrm:changed', changed)
  }, [client, user?.uid, refetchContext])
  useEffect(() => { void client.resetQueries({ queryKey: ['firmcrm', user?.uid] }) }, [client, user?.uid, fingerprint])
  useEffect(() => () => { client.removeQueries({ queryKey: ['firmcrm', user?.uid] }) }, [client, user?.uid])
  if (context.isError) return <div role="alert" className="p-8">{context.error.message}<button className="ml-4 underline" onClick={() => context.refetch()}>Retry</button></div>
  if (!context.data) return <div className="p-8" role="status">Loading FirmCRM…</div>
  const restricted = /\/(admin|data)$/.test(pathname) && !['manager','partner','admin'].includes(context.data.user.role)
  return <CrmContext.Provider value={context.data}><ToastProvider><ConfirmProvider><ErrorBoundary><Shell>{restricted ? <p role="alert">CRM manager access is required.</p> : <div key={scope.join(':')}>{children}</div>}</Shell></ErrorBoundary></ConfirmProvider></ToastProvider></CrmContext.Provider>
}
export function FirmCrmProvider({ children }: { children: ReactNode }) {
  return <AnalyticsFirmGate productName="FirmCRM"><Workspace>{children}</Workspace></AnalyticsFirmGate>
}
