import type { EsignContext } from '@/lib/api'

export interface EsignAccessRule { feature?: string; capability?: string; administrative?: string }

export const ESIGN_ROUTE_RULES: Array<{ prefix: string; rule: EsignAccessRule }> = [
  { prefix: '/dashboard/esign/admin', rule: { administrative: 'manage_settings' } },
  { prefix: '/dashboard/esign/reports', rule: { capability: 'reports' } },
  { prefix: '/dashboard/esign/powerforms', rule: { feature: 'powerforms', capability: 'powerforms' } },
  { prefix: '/dashboard/esign/bulk', rule: { feature: 'bulk_sends', capability: 'bulk_sends' } },
  { prefix: '/dashboard/esign/templates', rule: { capability: 'templates' } },
]

export function hasEsignAccess(context: EsignContext | undefined, rule: EsignAccessRule): boolean {
  if (!context) return false
  if (context.profile.admin_override) return true
  if (rule.feature && !context.features[rule.feature]) return false
  if (rule.capability && !context.profile.capabilities[rule.capability]) return false
  if (rule.administrative && !context.administrative_capabilities[rule.administrative]) return false
  return true
}

export function esignRouteRule(pathname: string): EsignAccessRule | undefined {
  return ESIGN_ROUTE_RULES.find(({ prefix }) => pathname.startsWith(prefix))?.rule
}
