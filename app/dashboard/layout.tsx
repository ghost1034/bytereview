import AuthGuard from '@/components/auth/AuthGuard'
import { DashboardShell } from '@/components/layout/dashboard-shell'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: DashboardLayoutProps) {
  return (
    <AuthGuard requireAuth={true} redirectTo="/">
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  )
}
