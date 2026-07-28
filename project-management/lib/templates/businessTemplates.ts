/**
 * Backward-compatible exports for step 06 CreateProjectDialog and onboarding.
 * @deprecated Prefer templateLibrary.ts and instantiateTemplate directly.
 */
export {
  BUSINESS_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LIBRARY,
  getTemplateById,
  getCuratedTemplateById,
  toTemplateCardView,
  countTemplateTasks,
  templatesByCategory,
  searchTemplates,
} from './templateLibrary'

export type { TemplateCardView as BusinessTemplate, TemplateCardView as TemplateCard } from './types'

export type TemplateTask = { name: string; sectionIndex: number; notes?: string }
