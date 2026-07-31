'use client'

import { PageHeader } from '@/components/ui/page-header'
import { ActivationForm } from '@/components/activation/ActivationForm'
import { HostedClawCard } from '@/components/activation/HostedClawCard'

export default function ActivationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Claw Series activation"
        description="Activate AccountingClaw and LegalClaw with one personal key — run them as cloud digital workers (Docker) or install them into the Hermes Desktop app. Your installation exchanges this key for the encrypted skill bundle."
      />
      <div className="max-w-3xl space-y-8">
        <HostedClawCard />
        <ActivationForm />
      </div>
    </div>
  )
}
