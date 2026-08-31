import { FlatCompat } from '@eslint/eslintrc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const semanticColorRules = [
  'error',
  {
    selector:
      'Literal[value=/(bg|text|border|ring|from|to|via|placeholder|divide|outline|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}/]',
    message:
      'Use semantic design tokens (bg-surface, bg-surface-muted, text-foreground, text-foreground-muted, bg-primary-soft, bg-success-soft, etc.) instead of raw Tailwind color classes.',
  },
  {
    selector: 'Literal[value=/lido-(blue|green)(-dark)?/]',
    message:
      'lido-blue / lido-green are deprecated. Use bg-primary, bg-primary-soft, or bg-success / bg-success-soft.',
  },
]

// Pre-existing violations outside Tasklytic stay visible as warnings without
// weakening rules for new files. Remove paths from these lists as debt is paid.
const legacyAnyFiles = [
  'app/dashboard/cpe-tracker/page.tsx',
  'app/dashboard/esign/admin/page.tsx',
  'app/dashboard/inkwise/templates/**/page.tsx',
  'app/dashboard/inkwise/write/**/page.tsx',
  'app/dashboard/jobs/**/fields/page.tsx',
  'app/dashboard/jobs/**/processing/page.tsx',
  'app/dashboard/jobs/**/review/page.tsx',
  'app/dashboard/templates/page.tsx',
  'components/analytics/DataTable.tsx',
  'components/analytics/DataUploadFlow.tsx',
  'components/auth/AuthModal.tsx',
  'components/automations/AutomationModal.tsx',
  'components/automations/AutomationRunsModal.tsx',
  'components/cpe/CpeResultsTable.tsx',
  'components/extraction/SaveTemplate.tsx',
  'components/extraction/TemplateSelection.tsx',
  'components/inkwise/citation-bubbles.tsx',
  'components/inkwise/source-import-panel.tsx',
  'components/integrations/GoogleDriveFolderPicker.tsx',
  'components/integrations/GoogleDrivePicker.tsx',
  'components/marketing/faq-accordion.tsx',
  'components/pages/contact.tsx',
  'components/pages/subscribe.tsx',
  'components/results/EditableResultsTable.tsx',
  'components/templates/TemplateLibrary.tsx',
  'components/templates/TemplateModal.tsx',
  'components/templates/TemplatePreviewModal.tsx',
  'components/workflow/steps/EnhancedFileUpload.tsx',
  'components/workflow/steps/FieldConfigurationStep.tsx',
  'components/workflow/steps/ProcessingStep.tsx',
  'components/workflow/steps/ResultsStep.tsx',
  'hooks/useAutomations.ts',
  'hooks/useConnector.ts',
  'hooks/useEnvelopes.ts',
  'hooks/useExportRefs.ts',
  'hooks/useExtraction.ts',
  'hooks/useGoogleIntegration.ts',
  'hooks/useJobWorkflow.ts',
  'hooks/useJobs.ts',
  'hooks/useOperationPoll.ts',
  'lib/analytics/mockReconData.ts',
  'lib/api.ts',
  'lib/firebase.ts',
  'lib/inkwise-editor-extensions.ts',
]

const legacySemanticColorFiles = [
  'app/(general)/pbc/access/page.tsx',
  'app/dashboard/analytics/chrona/**/page.tsx',
  'components/cpe/CpeResultsTable.tsx',
  'components/extraction/FieldConfigurationEditor.tsx',
  'components/extraction/SaveTemplate.tsx',
  'components/extraction/TemplateSelection.tsx',
  'components/jobs/RunSelector.tsx',
  'components/marketing/product-card.tsx',
  'components/pages/home/AnalyticsShowcase.tsx',
  'components/pages/home/ChronaShowcase.tsx',
  'components/pages/home/ClawShowcase.tsx',
  'components/pages/home/EsignShowcase.tsx',
  'components/pages/home/PbcShowcase.tsx',
  'components/pages/home/ProductSuite.tsx',
  'components/pages/home/ProjectManagementShowcase.tsx',
  'components/pages/home/shared/tones.ts',
  'components/pages/not-found.tsx',
]

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'public/pdf-worker.min.mjs',
      'public/draco/**',
      // Archived Webflow export retained only as a visual reference.
      'redesign/**',
      'backend/scripts/convert_inkwise_docx.cjs',
    ],
  },
  {
    files: [
      'app/dashboard/**/*.{ts,tsx}',
      'app/(general)/**/*.{ts,tsx}',
      'app/project-management/**/*.{ts,tsx}',
      'components/layout/**/*.{ts,tsx}',
      'components/marketing/**/*.{ts,tsx}',
      'components/workflow/**/*.{ts,tsx}',
      'components/jobs/**/*.{ts,tsx}',
      'components/extraction/**/*.{ts,tsx}',
      'components/results/**/*.{ts,tsx}',
      'components/templates/**/*.{ts,tsx}',
      'components/automations/**/*.{ts,tsx}',
      'components/integrations/**/*.{ts,tsx}',
      'components/billing/**/*.{ts,tsx}',
      'components/subscription/**/*.{ts,tsx}',
      'components/cpe/**/*.{ts,tsx}',
      'components/pages/**/*.{ts,tsx}',
      'project-management/**/*.{ts,tsx}',
    ],
    ignores: [
      'app/dashboard/inkwise/**/*.{ts,tsx}',
      'components/pages/inkwise/**/*.{ts,tsx}',
      'components/inkwise/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': semanticColorRules,
    },
  },
  {
    files: legacyAnyFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: legacySemanticColorFiles,
    rules: {
      'no-restricted-syntax': semanticColorRules.map((entry) =>
        typeof entry === 'string' ? 'warn' : entry
      ),
    },
  },
  {
    files: ['next-sitemap.config.js', 'tailwind.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['hooks/useExportRefs.ts', 'lib/esign/fieldLogic.ts', 'lib/inkwise-editor.ts'],
    rules: {
      'prefer-const': 'warn',
    },
  },
  {
    files: ['hooks/useOperationPoll.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  {
    files: ['components/workflow/steps/ResultsStep.tsx'],
    rules: {
      'react/display-name': 'warn',
    },
  },
  {
    files: ['taxatlas-ui/**/*.{ts,tsx}'],
    rules: {
      // TaxAtlas table definitions store JSX values in typed row tuples. They
      // are keyed by the shared table renderer rather than at the tuple site.
      'react/jsx-key': 'off',
    },
  },
  {
    files: [
      'app/dashboard/form-fill/page.tsx',
      'components/automations/AutomationModal.tsx',
      'components/privacy/CookieBanner.tsx',
    ],
    rules: {
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default eslintConfig
