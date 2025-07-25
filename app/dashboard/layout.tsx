import { DashboardLayout } from '@/components/layout/dashboard-layout'
import AuthGuard from '@/components/auth/AuthGuard'
import Header from '@/components/layout/header'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: DashboardLayoutProps) {
  return (
    <AuthGuard requireAuth={true} redirectTo="/">
      <div className="min-h-screen">
        <Header />
        <div className="pt-16">
          <DashboardLayout>
            {children}
          </DashboardLayout>
        </div>
      </div>
    </AuthGuard>
  )
}