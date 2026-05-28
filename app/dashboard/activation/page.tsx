'use client'

import { PageHeader } from '@/components/ui/page-header'
import { ActivationForm } from '@/components/activation/ActivationForm'

export default function ActivationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="AccountingClaw activation"
        description="Activate the AccountingClaw Docker image with your personal key. The container exchanges this key for the encrypted skill bundle at startup."
      />
      <div className="max-w-3xl">
        <ActivationForm />
      </div>
    </div>
  )
}
