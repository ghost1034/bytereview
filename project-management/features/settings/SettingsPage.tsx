'use client'

/** Settings hub — links to Tasklytic workspace configuration pages. */
import Link from 'next/link'
import { CreditCard, FileText, Gauge, Layers, Mail, Settings2, Users, Zap, Building2 } from 'lucide-react'
import { usePageMeta } from '../../hooks/usePageMeta'
import { EvaluationTenantsPanel } from '../onboarding/EvaluationTenantsPanel'
import { OnboardingSettingsPanel } from '../onboarding/OnboardingSettingsPanel'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'

const LINKS = [
  {
    href: 'settings/workspace',
    label: 'Workspace',
    description: 'Name, icon, members, billing, and danger zone.',
    icon: Building2,
  },
  {
    href: 'settings/fields',
    label: 'Field library',
    description: 'Create and manage workspace custom fields.',
    icon: Layers,
  },
  {
    href: 'members',
    label: 'Members',
    description: 'Manage workspace members, roles, and invitations.',
    icon: Users,
  },
  {
    href: 'settings/pending-emails',
    label: 'Pending emails',
    description: 'Review queued invite and notification emails.',
    icon: Mail,
  },
  {
    href: 'settings/billing-inquiries',
    label: 'Billing inquiries',
    description: 'Upgrade and payment contact-sales requests.',
    icon: CreditCard,
  },
  {
    href: 'forms',
    label: 'Forms',
    description: 'Create and manage project intake forms.',
    icon: FileText,
  },
  {
    href: 'workload',
    label: 'Workload',
    description: 'See open task counts by assignee.',
    icon: Gauge,
  },
  {
    href: 'rules',
    label: 'Rules',
    description: 'Automate actions when tasks change.',
    icon: Zap,
  },
] as const

export function SettingsPage() {
  const { workspaceId, workspace } = useWorkspaceContext()

  usePageMeta({ breadcrumbs: [{ label: 'Settings' }] })

  if (!workspaceId) return null

  const base = `/dashboard/project-management/w/${workspaceId}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Settings</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
          {workspace?.name ?? 'Workspace'} configuration and automation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={`${base}/${item.href}`}
              className="tl-card group flex flex-col gap-2 p-4 shadow-paper-sm transition-shadow hover:shadow-paper-md"
            >
              <span className="inline-flex items-center gap-2 font-medium group-hover:underline">
                <Icon className="h-4 w-4" style={{ color: 'var(--primary)' }} strokeWidth={1.5} />
                {item.label}
              </span>
              <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                {item.description}
              </span>
            </Link>
          )
        })}
      </div>

      <EvaluationTenantsPanel />

      <OnboardingSettingsPanel />

      <div className="tl-card flex items-start gap-3 p-4 shadow-paper-sm">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium">Custom fields</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
            Priority and Status are seeded globally when you join a workspace. Manage all fields in the{' '}
            <Link href={`${base}/settings/fields`} className="underline">
              field library
            </Link>
            , then attach them from each project.
          </p>
        </div>
      </div>
    </div>
  )
}
