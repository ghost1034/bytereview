import Demo from '@/components/pages/demo'
import AuthGuard from '@/components/auth/AuthGuard'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.demo)

export default function DemoPage() {
  return (
    <AuthGuard requireAuth={false} redirectTo="/dashboard">
      <Demo />
    </AuthGuard>
  )
}