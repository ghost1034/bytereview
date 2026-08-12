/**
 * Billing rate cascade — most specific wins.
 * Order: matter user/role → matter rate card → project → client/card → team role →
 * workspace role → user default → fallback 0.
 */
import type { BillingRate, Client, ID, ISODate, Matter, Project, RateCard, RateSource, User } from '../../types'

export type ResolveRateArgs = {
  workspaceId?: ID
  userId: ID
  date?: ISODate
  matterId?: ID
  projectId?: ID
  clientId?: ID
  client?: Client
  user?: User
  matter?: Matter
  project?: Project
  billingRates: BillingRate[]
  rateCards: RateCard[]
  defaultCurrency?: string
}

export type ResolvedRate = {
  hourlyRate: number
  currency: string
  rateSource: RateSource
  label: string
}

function isEffective(rate: BillingRate, date: ISODate): boolean {
  if (rate.effectiveFrom > date) return false
  if (rate.effectiveTo && rate.effectiveTo <= date) return false
  return true
}

function pickRate(
  rates: BillingRate[],
  date: ISODate,
  match: (r: BillingRate) => boolean
): BillingRate | undefined {
  return rates.filter((r) => isEffective(r, date) && match(r)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
}

function fromCard(
  card: RateCard | undefined,
  user: User | undefined,
  date: ISODate
): BillingRate | undefined {
  if (!card) return undefined
  const role = user?.timekeeperRole
  return (
    pickRate(card.rates, date, (r) => r.userId === user?.id) ??
    (role ? pickRate(card.rates, date, (r) => r.scope === 'role' && r.role === role) : undefined) ??
    pickRate(card.rates, date, (r) => r.scope === 'role')
  )
}

/** Resolve hourly billing rate for a timekeeper on a given date. */
export function resolveRate(args: ResolveRateArgs): ResolvedRate {
  const date = args.date ?? new Date().toISOString().slice(0, 10)
  const currency = args.defaultCurrency ?? 'USD'
  const user = args.user
  const rates = args.billingRates.filter((r) => r.workspaceId === (args.workspaceId ?? args.matter?.workspaceId ?? args.project?.workspaceId))

  const matterRate =
    pickRate(rates, date, (r) => r.scope === 'matter' && r.scopeId === args.matterId && r.userId === args.userId) ??
    (user?.timekeeperRole
      ? pickRate(rates, date, (r) => r.scope === 'matter' && r.scopeId === args.matterId && r.role === user.timekeeperRole)
      : undefined)

  if (matterRate) {
    return { hourlyRate: matterRate.hourlyRate, currency: matterRate.currency, rateSource: 'matter', label: 'Matter override' }
  }

  const matterCard = args.rateCards.find((c) => c.id === args.matter?.rateCardId)
  const cardHit = fromCard(matterCard, user, date)
  if (cardHit) {
    return { hourlyRate: cardHit.hourlyRate, currency: cardHit.currency, rateSource: 'matter', label: `Matter rate card — ${matterCard?.name ?? ''}` }
  }

  const projectRate =
    pickRate(rates, date, (r) => r.scope === 'project' && r.scopeId === args.projectId && r.userId === args.userId) ??
    (user?.timekeeperRole
      ? pickRate(rates, date, (r) => r.scope === 'project' && r.scopeId === args.projectId && r.role === user.timekeeperRole)
      : undefined)

  if (projectRate) {
    return { hourlyRate: projectRate.hourlyRate, currency: projectRate.currency, rateSource: 'project', label: 'Project override' }
  }

  const clientRate =
    pickRate(rates, date, (r) => r.scope === 'client' && r.scopeId === args.clientId && r.userId === args.userId) ??
    (user?.timekeeperRole
      ? pickRate(rates, date, (r) => r.scope === 'client' && r.scopeId === args.clientId && r.role === user.timekeeperRole)
      : undefined)

  if (clientRate) {
    return { hourlyRate: clientRate.hourlyRate, currency: clientRate.currency, rateSource: 'client', label: 'Client override' }
  }

  const clientCardId = args.client?.defaultRateCardId ?? args.project?.rateCardId
  const clientCard = args.rateCards.find((c) => c.id === clientCardId)
  const clientCardHit = fromCard(clientCard, user, date)
  if (clientCardHit) {
    return { hourlyRate: clientCardHit.hourlyRate, currency: clientCardHit.currency, rateSource: 'client', label: `Client rate card — ${clientCard?.name ?? ''}` }
  }

  const teamRate = user?.timekeeperRole
    ? pickRate(rates, date, (r) => r.scope === 'team' && r.role === user.timekeeperRole)
    : undefined
  if (teamRate) {
    return { hourlyRate: teamRate.hourlyRate, currency: teamRate.currency, rateSource: 'team', label: `Team — ${user?.timekeeperRole}` }
  }

  const workspaceRate = user?.timekeeperRole
    ? pickRate(rates, date, (r) => r.scope === 'workspace' && r.role === user.timekeeperRole)
    : undefined
  if (workspaceRate) {
    return { hourlyRate: workspaceRate.hourlyRate, currency: workspaceRate.currency, rateSource: 'workspace', label: `Workspace — ${user?.timekeeperRole}` }
  }

  const userDefault = pickRate(rates, date, (r) => r.scope === 'user_default' && r.userId === args.userId)
  if (userDefault) {
    return { hourlyRate: userDefault.hourlyRate, currency: userDefault.currency, rateSource: 'user_default', label: 'User default rate' }
  }

  if (user?.defaultHourlyRate) {
    return { hourlyRate: user.defaultHourlyRate, currency, rateSource: 'user_default', label: 'User profile rate' }
  }

  console.warn('[resolveRate] No rate found; using 0', args)
  return { hourlyRate: 0, currency, rateSource: 'override', label: 'No rate configured' }
}

/** Compute billable amount from hours and hourly rate. */
export function computeTimeAmount(hours: number, hourlyRate: number, billable: boolean): number {
  return billable ? Math.round(hours * hourlyRate * 100) / 100 : 0
}
