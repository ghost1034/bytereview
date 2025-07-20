import { DashboardLayout } from '@/components/layout/dashboard-layout'
import AuthGuard from '@/components/auth/AuthGuard'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: DashboardLayoutProps) {
  return (
    <AuthGuard requireAuth={true} redirectTo="/">
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </AuthGuard>
  )
}