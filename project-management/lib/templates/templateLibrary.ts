/**
 * Central registry for all curated project templates (steps 27, 27b, 27c).
 */
import { GENERAL_TEMPLATES } from './curated/general'
import { BUSINESS_TEMPLATES as INDUSTRY_BUSINESS } from './industry/business'
import { ACCOUNTING_TEMPLATES } from './industry/accounting'
import { LAW_TEMPLATES } from './industry/law'
import { FINANCE_TEMPLATES } from './industry/finance'
import { PROCUREMENT_TEMPLATES } from './industry/procurement'
import { HR_TEMPLATES } from './industry/hr'
import {
  TRANSACTION_TEMPLATES,
  riskRegisterTemplate,
  spinoffRiskRegisterTemplate,
} from './transactions/transactions'
import type { CuratedProjectTemplate, TemplateCardView, TemplateCategory } from './types'
import { countTaskSpecs } from './builders'

/** All gallery-visible curated templates. */
export const TEMPLATE_LIBRARY: CuratedProjectTemplate[] = [
  ...GENERAL_TEMPLATES,
  ...INDUSTRY_BUSINESS,
  ...ACCOUNTING_TEMPLATES,
  ...LAW_TEMPLATES,
  ...FINANCE_TEMPLATES,
  ...PROCUREMENT_TEMPLATES,
  ...HR_TEMPLATES,
  ...TRANSACTION_TEMPLATES.filter((t) => !t.id.includes('subtemplate') && !t.id.startsWith('txn-')),
]

/** Internal templates (siblings, PMI, TSA, risk registers). */
export const INTERNAL_TEMPLATES: CuratedProjectTemplate[] = [
  riskRegisterTemplate,
  spinoffRiskRegisterTemplate,
  ...TRANSACTION_TEMPLATES.filter((t) => t.id.includes('subtemplate') || t.id.startsWith('txn-')),
]

export const ALL_TEMPLATES: CuratedProjectTemplate[] = [...TEMPLATE_LIBRARY, ...INTERNAL_TEMPLATES]

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'General',
  'Business',
  'Accounting & Tax',
  'Law',
  'Finance',
  'Procurement',
  'HR',
  'Corporate Dev',
]

export function getCuratedTemplateById(id: string): CuratedProjectTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id)
}

/** Legacy adapter for CreateProjectDialog / onboarding. */
export function getTemplateById(id: string): TemplateCardView | undefined {
  const t = getCuratedTemplateById(id)
  if (!t) return undefined
  return toTemplateCardView(t)
}

export function toTemplateCardView(t: CuratedProjectTemplate): TemplateCardView {
  const specs = t.taskSpecs ?? []
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    icon: t.iconEmoji,
    category: t.category,
    sections: t.sectionNames,
    tasks: specs.map((s) => ({ name: s.name, sectionIndex: s.sectionIndex, notes: s.notes })),
  }
}

/** @deprecated use TEMPLATE_LIBRARY */
export const BUSINESS_TEMPLATES = TEMPLATE_LIBRARY.map(toTemplateCardView)

export function countTemplateTasks(t: CuratedProjectTemplate): number {
  if (t.taskSpecs) return countTaskSpecs(t.taskSpecs)
  return t.taskTemplates.length
}

export function templatesByCategory(category: TemplateCategory | 'all'): CuratedProjectTemplate[] {
  if (category === 'all') return TEMPLATE_LIBRARY
  return TEMPLATE_LIBRARY.filter((t) => t.category === category)
}

export function searchTemplates(query: string): CuratedProjectTemplate[] {
  const q = query.trim().toLowerCase()
  if (!q) return TEMPLATE_LIBRARY
  return TEMPLATE_LIBRARY.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
  )
}
