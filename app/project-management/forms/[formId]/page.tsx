import type { Metadata } from 'next'

import { TasklyticPublicProvider } from '@/project-management/TasklyticPublicProvider'
import { PublicFormPage } from '@/project-management/features/forms/PublicFormPage'

export const metadata: Metadata = {
  title: 'Project intake form',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ formId: string }>
}

export default async function ProjectManagementPublicFormPage({ params }: Props) {
  const { formId } = await params
  return (
    <TasklyticPublicProvider>
      <PublicFormPage formId={formId} />
    </TasklyticPublicProvider>
  )
}
