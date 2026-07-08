'use client'

import { PageHeader } from '@/components/ui/page-header'
import { ActivationForm } from '@/components/activation/ActivationForm'

export default function ActivationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Claw Series activation"
        description="Activate AccountingClaw and LegalClaw with one personal key — run them as cloud digital workers (Docker) or install them into the Hermes Desktop app. Your installation exchanges this key for the encrypted skill bundle."
      />
      <div className="max-w-3xl">
        <ActivationForm />
      </div>
    </div>
  )
}
