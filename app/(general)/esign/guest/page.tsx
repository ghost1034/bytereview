import { Suspense } from 'react'
import GuestSigningPage from '../../../dashboard/esign/guest/page'

export default function PublicGuestSigningPage() {
  return <Suspense fallback={<p className="p-8 text-center text-sm text-foreground-muted">Opening secure guest ceremony…</p>}><GuestSigningPage /></Suspense>
}
