'use client'

import { useParams } from 'next/navigation'
import { PbcEngagementWorkspace } from '@/components/pbc/PbcEngagementWorkspace'

export default function PbcEngagementPage() {
  const params = useParams<{ engagementId: string }>()
  return <PbcEngagementWorkspace engagementId={params.engagementId} />
}

