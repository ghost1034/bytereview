import Demo from '@/components/pages/demo'
import AuthGuard from '@/components/auth/AuthGuard'

export default function DemoPage() {
  return (
    <AuthGuard requireAuth={false} redirectTo="/dashboard">
      <Demo />
    </AuthGuard>
  )
}