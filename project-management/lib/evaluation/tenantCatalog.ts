/**
 * Evaluation tenant catalog — seven vertical fixtures for Sales / CS / Support.
 */
import type { ProvisioningPlan } from '../provisioning/types'
import { atlasStudioPlan } from './plans/atlasStudio'
import { crestwoodFinancePlan } from './plans/crestwoodFinance'
import { hartwellCrossPlan } from './plans/hartwellCross'
import { lighthousePeoplePlan } from './plans/lighthousePeople'
import { meridianCapitalPlan } from './plans/meridianCapital'
import { northwindProcurementPlan } from './plans/northwindProcurement'
import { sterlingBrooksPlan } from './plans/sterlingBrooks'

export type EvaluationTenantId =
  | 'atlas-studio'
  | 'sterling-brooks'
  | 'hartwell-cross'
  | 'crestwood-finance'
  | 'northwind-procurement'
  | 'lighthouse-people'
  | 'meridian-capital'

export type EvaluationTenantDef = {
  id: EvaluationTenantId
  name: string
  vertical: string
  seed: number
  partitionKey: string
  buildPlan: (ownerId: string) => ProvisioningPlan
}

export const EVALUATION_TENANTS: EvaluationTenantDef[] = [
  {
    id: 'atlas-studio',
    name: 'Atlas Studio',
    vertical: 'Digital product agency',
    seed: 1001,
    partitionKey: 'eval:atlas',
    buildPlan: atlasStudioPlan,
  },
  {
    id: 'sterling-brooks',
    name: 'Sterling & Brooks CPA',
    vertical: 'Accounting / CPA',
    seed: 1002,
    partitionKey: 'eval:sterling',
    buildPlan: sterlingBrooksPlan,
  },
  {
    id: 'hartwell-cross',
    name: 'Hartwell & Cross LLP',
    vertical: 'Law firm',
    seed: 1003,
    partitionKey: 'eval:hartwell',
    buildPlan: hartwellCrossPlan,
  },
  {
    id: 'crestwood-finance',
    name: 'Crestwood Holdings — Finance',
    vertical: 'Corporate finance',
    seed: 1004,
    partitionKey: 'eval:crestwood',
    buildPlan: crestwoodFinancePlan,
  },
  {
    id: 'northwind-procurement',
    name: 'Northwind Industrial — Procurement',
    vertical: 'Procurement',
    seed: 1005,
    partitionKey: 'eval:northwind',
    buildPlan: northwindProcurementPlan,
  },
  {
    id: 'lighthouse-people',
    name: 'Lighthouse People Co.',
    vertical: 'HR / People',
    seed: 1006,
    partitionKey: 'eval:lighthouse',
    buildPlan: lighthousePeoplePlan,
  },
  {
    id: 'meridian-capital',
    name: 'Meridian Capital Partners',
    vertical: 'Corporate development / M&A',
    seed: 1007,
    partitionKey: 'eval:meridian',
    buildPlan: meridianCapitalPlan,
  },
]

export function getEvaluationTenant(id: EvaluationTenantId): EvaluationTenantDef | undefined {
  return EVALUATION_TENANTS.find((t) => t.id === id)
}
