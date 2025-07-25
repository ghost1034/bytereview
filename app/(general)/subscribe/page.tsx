import Subscribe from '@/components/pages/subscribe'
import AuthGuard from '@/components/auth/AuthGuard'

export default function SubscribePage() {
  return (
    <AuthGuard requireAuth={true} redirectTo="/pricing">
      <Subscribe />
    </AuthGuard>
  )
}