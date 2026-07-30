/**
 * PSA sample data provisioning for evaluation / industry workspaces.
 */
import { newId } from '../ids'
import { now } from '../time'
import type { BillingRate, Client, ID, RateCard, TimeEntry } from '../../types'
import {
  useClientsStore,
  useRateCardsStore,
  useTimeEntriesStore,
  useWorkspacesStore,
} from '../../stores/entities'
import { createSeededRng } from './seedRng'
import type { PsaProvisioningSpec } from './types'

const DEFAULT_ACCOUNTING_TIERS = [
  { role: 'Partner', hourlyRate: 550 },
  { role: 'Senior Manager', hourlyRate: 400 },
  { role: 'Manager', hourlyRate: 275 },
  { role: 'Senior', hourlyRate: 200 },
  { role: 'Staff', hourlyRate: 150 },
]

const DEFAULT_LEGAL_TIERS = [
  { role: 'Partner', hourlyRate: 650 },
  { role: 'Senior Associate', hourlyRate: 400 },
  { role: 'Associate', hourlyRate: 275 },
  { role: 'Paralegal', hourlyRate: 145 },
]

/** Seed clients, rate card, and sample time entries. */
export async function provisionPsaData(
  workspaceId: ID,
  ownerId: ID,
  spec: PsaProvisioningSpec,
  seed = 42
): Promise<void> {
  const rng = createSeededRng(seed)
  const ws = useWorkspacesStore.getState().getById(workspaceId)
  if (!ws?.psaMode) return

  const currency = ws.defaultCurrency ?? 'USD'
  const effectiveFrom = now().slice(0, 10)
  const tiers = spec.rateTiers ?? (ws.psaMode === 'legal' ? DEFAULT_LEGAL_TIERS : DEFAULT_ACCOUNTING_TIERS)
  const rateCardId = newId()
  const rates: BillingRate[] = tiers.map((t) => ({
    id: newId(),
    workspaceId,
    scope: 'role',
    role: t.role,
    hourlyRate: t.hourlyRate,
    currency,
    effectiveFrom,
    createdAt: now(),
  }))

  const rateCard: RateCard = {
    id: rateCardId,
    workspaceId,
    name: spec.rateCardName ?? `${ws.name} — Standard 2026`,
    rates,
    currency,
    effectiveFrom,
  }
  await useRateCardsStore.getState().add(rateCard)

  const clientSpecs = spec.clients ?? [
    { name: 'Acme Industries', industry: 'Manufacturing' },
    { name: 'Beacon Logistics', industry: 'Transportation' },
    { name: 'Crestwood Health', industry: 'Healthcare' },
  ]

  const clientIds: ID[] = []
  for (const c of clientSpecs) {
    const client: Client = {
      id: newId(),
      workspaceId,
      name: c.name,
      type: 'business',
      industry: c.industry,
      defaultRateCardId: rateCardId,
      paymentTerms: 'net_30',
      defaultCurrency: currency,
      archived: false,
      createdAt: now(),
    }
    await useClientsStore.getState().add(client)
    clientIds.push(client.id)
  }

  const entryCount = spec.sampleTimeEntryCount ?? 12
  const statuses: TimeEntry['status'][] = ['draft', 'submitted', 'approved', 'billed']
  for (let i = 0; i < entryCount; i += 1) {
    const hours = 0.5 + Math.floor(rng() * 8)
    const tier = tiers[Math.floor(rng() * tiers.length)]
    const daysAgo = Math.floor(rng() * 28)
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    const entry: TimeEntry = {
      id: newId(),
      workspaceId,
      userId: ownerId,
      clientId: clientIds[Math.floor(rng() * clientIds.length)],
      description: `Sample ${tier.role} work — entry ${i + 1}`,
      hours,
      durationMinutes: Math.round(hours * 60),
      date: date.toISOString().slice(0, 10),
      billable: rng() > 0.15,
      rateSnapshot: tier.hourlyRate,
      rateSource: 'role',
      currency,
      amount: hours * tier.hourlyRate,
      activityCode: ws.psaMode === 'legal' ? `L${100 + Math.floor(rng() * 5) * 100}` : 'A101',
      status: statuses[Math.floor(rng() * statuses.length)],
      approved: rng() > 0.4,
      invoiced: rng() > 0.7,
      createdAt: now(),
      modifiedAt: now(),
    }
    await useTimeEntriesStore.getState().add(entry)
  }
}
