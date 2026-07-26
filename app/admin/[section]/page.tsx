import { notFound } from 'next/navigation'

import { AdminSectionPage } from '@/components/admin/admin-section-page'

const SECTIONS = new Set([
  'users', 'extraction', 'form-fill', 'inkwise', 'analytics', 'chrona',
  'e-sign', 'automations', 'platform', 'database',
])

export default async function AdminProductPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!SECTIONS.has(section)) notFound()
  return <AdminSectionPage section={section} />
}
