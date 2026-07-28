import { Suspense } from 'react'

import { AcceptInvitePage } from '@/project-management/AcceptInvitePage'

export default function ProjectManagementAcceptInvitePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm">Loading invitation…</p>}>
      <AcceptInvitePage />
    </Suspense>
  )
}
