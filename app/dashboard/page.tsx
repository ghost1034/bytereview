import type { Metadata } from 'next'

import { ProductDashboardHome } from '@/components/pages/product-dashboard-home'

export const metadata: Metadata = {
  title: 'Products',
  description: 'Open any CPAAutomation product from one connected workspace.',
}

export default function DashboardPage() {
  return <ProductDashboardHome />
}
