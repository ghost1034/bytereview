import { cookies } from 'next/headers'

import AuthGuard from '@/components/auth/AuthGuard'
import { DashboardShell } from '@/components/layout/dashboard-shell'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default async function Layout({ children }: DashboardLayoutProps) {
  // Persisted sidebar state from the shadcn Sidebar primitive.
  const cookieStore = await cookies()
  const sidebarState = cookieStore.get('sidebar_state')?.value
  const defaultOpen = sidebarState === undefined ? true : sidebarState === 'true'

  return (
    <AuthGuard requireAuth={true} redirectTo="/">
      <DashboardShell defaultSidebarOpen={defaultOpen}>
        {children}
      </DashboardShell>
    </AuthGuard>
  )
}
