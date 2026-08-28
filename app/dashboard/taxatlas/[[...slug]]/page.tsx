import { redirect } from 'next/navigation'

import { TaxAtlasModule } from '@/taxatlas-ui/TaxAtlasModule'

export default async function TaxAtlasPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  if (!slug?.length) redirect('/dashboard/taxatlas/map')
  return <TaxAtlasModule />
}

