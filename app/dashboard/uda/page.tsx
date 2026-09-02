import type { Metadata } from 'next'

import { DashboardHome } from '@/components/pages/dashboard-home'

export const metadata: Metadata = {
  title: 'Universal Document Analysis',
  description: 'Extract, validate, and automate work from complex documents.',
}

export default function UdaDashboardPage() {
  return <DashboardHome />
}
