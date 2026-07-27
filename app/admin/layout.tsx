import type { Metadata } from 'next'

import AuthGuard from '@/components/auth/AuthGuard'
import { AdminProvider } from '@/components/admin/admin-context'
import { AdminShell } from '@/components/admin/admin-shell'

export const metadata: Metadata = {
  title: 'Admin Console | CPAAutomation',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth redirectTo="/">
      <AdminProvider><AdminShell>{children}</AdminShell></AdminProvider>
    </AuthGuard>
  )
}
