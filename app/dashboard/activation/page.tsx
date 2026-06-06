'use client'

import { PageHeader } from '@/components/ui/page-header'
import { ActivationForm } from '@/components/activation/ActivationForm'

export default function ActivationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="AccountingClaw activation"
        description="Activate AccountingClaw with your personal key — run it as a cloud digital worker (Docker) or install it into the Hermes Desktop app. Your installation exchanges this key for the AccountingClaw skill bundle."
      />
      <div className="max-w-3xl">
        <ActivationForm />
      </div>
    </div>
  )
}
