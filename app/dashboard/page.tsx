import Dashboard from '@/components/pages/dashboard'
import AuthGuard from '@/components/auth/AuthGuard'

export default function DashboardPage() {
  return (
    <AuthGuard requireAuth={true} redirectTo="/">
      <Dashboard />
    </AuthGuard>
  )
}