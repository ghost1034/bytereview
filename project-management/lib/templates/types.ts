/**
 * Extended template types for Tasklytic curated library (steps 27–27c).
 * Additive extensions to ProjectTemplate / TaskTemplate — do not mutate core entities.
 */
import type {
  Chart,
  CustomField,
  Dashboard,
  Form,
  Project,
  ProjectTemplate,
  ProjectView,
  Rule,
  Task,
  TaskTemplate,
} from '../../types'

/** Template gallery category chips. */
export type TemplateCategory =
  | 'General'
  | 'Business'
  | 'Accounting & Tax'
  | 'Law'
  | 'Finance'
  | 'Procurement'
  | 'HR'
  | 'Corporate Dev'

/** Relative scheduling on template tasks (days from project start). */
export type TemplateTaskSpec = {
  name: string
  sectionIndex: number
  relativeStartDays?: number
  relativeDueDays?: number
  assigneeRole?: string
  milestone?: boolean
  notes?: string
  subtasks?: Omit<TemplateTaskSpec, 'sectionIndex' | 'subtasks'>[]
}

/** Local custom field spec attached when instantiating a template. */
export type TemplateFieldSpec = {
  name: string
  type: CustomField['type']
  description?: string
  isGlobal?: boolean
  options?: Array<{ label: string; color: string }>
  numberFormat?: CustomField['numberFormat']
  currencySymbol?: string
  /** Reuse workspace global field by name instead of creating. */
  reuseGlobalName?: string
}

/** Optional sibling / child project spawned with a parent template. */
export type TemplateSiblingSpec = {
  suffix: string
  templateId: string
  linkAs: 'sibling' | 'child'
}

/** Child template offered after a milestone (PMI / TSA). */
export type TemplateChildOffer = {
  triggerTaskName: string
  childTemplateId: string
  namePattern: string
  toastMessage: string
}

/** Curated project template with gallery metadata and instantiation payload. */
export type CuratedProjectTemplate = ProjectTemplate & {
  industry?: string
  category: TemplateCategory
  iconEmoji: string
  color: string
  defaultView: ProjectView
  enabledViews?: ProjectView[]
  suggestedBundles?: string[]
  recommendedFields?: TemplateFieldSpec[]
  /** Flat task list for instantiation (converted to TaskTemplate tree). */
  taskSpecs?: TemplateTaskSpec[]
  ruleTemplates?: Array<Omit<Rule, 'id' | 'projectId' | 'createdBy' | 'createdAt'>>
  formTemplates?: Array<Omit<Form, 'id' | 'projectId' | 'createdAt'>>
  dashboardTemplates?: DashboardTemplateSpec[]
  siblingProjects?: TemplateSiblingSpec[]
  childProjectOffer?: TemplateChildOffer
  heavy?: boolean
  recurring?: string
  relatedTemplateIds?: string[]
}

/** Legacy card shape for CreateProjectDialog backward compatibility. */
export type TemplateCardView = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  sections: string[]
  tasks: Array<{ name: string; sectionIndex: number; notes?: string }>
}

/** Bundle — reusable pack applied to existing projects (step 27). */
export type Bundle = {
  id: string
  workspaceId: string
  name: string
  description?: string
  iconEmoji?: string
  customFieldIds: string[]
  sectionNames: string[]
  taskTemplates: TaskTemplate[]
  ruleTemplates: Array<Omit<Rule, 'id' | 'projectId' | 'createdBy' | 'createdAt'>>
  appliedToProjectIds: string[]
  createdBy: string
  createdAt: string
}

/** Project metadata persisted additively at instantiation time. */
export type InstantiatedProjectMeta = {
  templateId?: string
  parentProjectId?: string
  sourceTemplateName?: string
  pendingChildOffer?: TemplateChildOffer
}

export type ProjectWithTemplateMeta = Project & InstantiatedProjectMeta

export type InstantiateTemplateInput = {
  workspaceId: string
  teamId: string
  ownerId: string
  name?: string
  description?: string
  iconEmoji?: string
  color?: string
  privacy: Project['privacy']
  defaultView?: ProjectView
  enabledViews?: ProjectView[]
  startOn?: string
  parentProjectId?: string
  skipSiblingProjects?: boolean
}

export type InstantiateTemplateResult = {
  project: ProjectWithTemplateMeta
  siblingProjects: ProjectWithTemplateMeta[]
  childOffer?: TemplateChildOffer
}

export type SaveProjectAsTemplateInput = {
  projectId: string
  workspaceId: string
  createdBy: string
  name: string
  description?: string
  iconEmoji?: string
  includeTasks: boolean
  includeRules: boolean
  includeCustomFields: boolean
}

/** Dashboard chart spec without persisted id. */
export type ChartTemplate = Omit<Chart, 'id'>

/** Dashboard template without persisted ids. */
export type DashboardTemplateSpec = {
  name: string
  charts: ChartTemplate[]
  layout: Dashboard['layout']
}
