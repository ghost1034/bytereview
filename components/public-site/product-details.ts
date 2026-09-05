export type ProductGraphicKind =
  | 'extraction' | 'forms' | 'requests' | 'writing' | 'speech' | 'signature'
  | 'workers' | 'crm' | 'projects' | 'time' | 'learning' | 'analytics' | 'tax'

interface ProductDetail {
  tagline: string
  description: string
  capabilities: [string, string, string]
  useCase: string
  graphic: ProductGraphicKind
  graphicLabel: string
  guideHref?: string
}

// Product claims are grounded in content/docs/<product>/overview.md, docs/firmcrm.md,
// the Speech2Write product page, and the CPE Tracker dashboard.
export const PRODUCT_DETAILS: Record<string, ProductDetail> = {
  uda: {
    tagline: 'From source files to structured answers.',
    description: 'Turn invoices, financial statements, contracts, and other documents into spreadsheet-ready data. Define the fields that matter, let AI extract them, and review the results before you export.',
    capabilities: ['Reusable extraction templates for recurring work', 'Editable results with Excel, CSV, and Google Sheets exports', 'Google Drive connections and email-triggered automations'],
    useCase: 'Investment statements, invoice processing, and contract data.',
    graphic: 'extraction',
    graphicLabel: 'Source documents become a structured table of extracted fields, ready for review and export.',
    guideHref: '/docs/universal-document-analysis/overview',
  },
  'form-fill': {
    tagline: 'Your data. In the right places.',
    description: 'Use spreadsheets, supporting documents, or Universal Document Analysis results to complete PDF and Word forms. Save a target form once and reuse it for the next client or reporting period.',
    capabilities: ['AI mapping from source data into form fields', 'Batch output per source file or spreadsheet row', 'Reusable templates with PDF and Word downloads'],
    useCase: 'Recurring client forms and document packages.',
    graphic: 'forms',
    graphicLabel: 'Client data maps into the corresponding fields of a completed form.',
    guideHref: '/docs/form-fill/overview',
  },
  pbc: {
    tagline: 'One request list. Every piece of evidence.',
    description: 'Build a request list for each client and period, then collect responses through a secure client portal. Keep uploads, conversations, and review decisions attached to the work they support.',
    capabilities: ['Request templates, owners, due dates, and reminders', 'Versioned evidence with accept-or-return review', 'Excel trackers, evidence packages, and exportable audit trails'],
    useCase: 'Audit support, close requests, and client evidence collection.',
    graphic: 'requests',
    graphicLabel: 'A client request list tracks bank statements, invoices, and supporting schedules through review.',
    guideHref: '/docs/prepared-by-client/overview',
  },
  inkwise: {
    tagline: 'Professional writing, grounded in your sources.',
    description: 'Bring your reference material into a writing workspace where AI can draft, rewrite, and answer questions using the sources you select. Follow citations back to the evidence as you review.',
    capabilities: ['Reusable reference library and document templates', 'Inline writing assistance and source-grounded chat', 'Citation styles including APA, Chicago, and Bluebook'],
    useCase: 'Accounting memos, investor reports, and legal or academic drafts.',
    graphic: 'writing',
    graphicLabel: 'A report draft connects numbered citations to its supporting reference library.',
    guideHref: '/docs/inkwise/overview',
  },
  speech2write: {
    tagline: 'Think it. Say it. Keep writing.',
    description: 'Dictate into the apps you already use with a global hotkey and a live transcription preview. Speech2Write is free and open source, with on-device recognition for Apple Silicon Macs running macOS 15 or later.',
    capabilities: ['Voice input wherever you write on your Mac', 'Optional local Apple Intelligence text cleanup', 'Custom vocabulary and professional terminology packs'],
    useCase: 'Emails, meeting follow-ups, notes, and first drafts.',
    graphic: 'speech',
    graphicLabel: 'A voice waveform becomes written text, with recognition running on your Mac.',
    guideHref: '/speech2write#install',
  },
  esign: {
    tagline: 'From prepared document to completed signature.',
    description: 'Upload PDFs, place fields, and route documents to the right signers. Track each envelope through completion and retain the signed document together with its completion evidence.',
    capabilities: ['Reusable templates and configurable signing order', 'Secure signer links without a required signer account', 'Digitally sealed PDFs and certificates of completion'],
    useCase: 'Engagement letters, approvals, and client agreements.',
    graphic: 'signature',
    graphicLabel: 'An agreement moves through preparation, sending, signing, and a sealed completion record.',
    guideHref: '/docs/e-signature/overview',
  },
  'claw-series': {
    tagline: 'Brief a digital worker. Review the deliverable.',
    description: 'Deploy AccountingClaw or LegalClaw to carry out repeatable professional workflows from a plain-language brief. Receive workpapers, drafts, and open questions for professional review. FinanceClaw is coming soon.',
    capabilities: ['Accounting skills for close, reconciliation, and reporting', 'Legal skills for research, drafting, and document review', 'Desktop or cloud deployment with personal activation'],
    useCase: 'Repeatable accounting and legal work with human sign-off.',
    graphic: 'workers',
    graphicLabel: 'A work brief routes to AccountingClaw or LegalClaw, producing a deliverable for human review.',
    guideHref: '/docs/claw-series/overview',
  },
  firmcrm: {
    tagline: 'Know the relationship. Move the pursuit forward.',
    description: 'Organize accounts, contacts, opportunities, and engagements in a CRM built for professional firms. Keep relationship activity and clearance decisions in the context of each client pursuit.',
    capabilities: ['Account and contact records with relationship activity', 'Opportunity pipelines and firm growth reporting', 'Conflict and independence clearance with access controls'],
    useCase: 'Business development, client relationships, and new-work clearance.',
    graphic: 'crm',
    graphicLabel: 'A client relationship connects to contacts, an opportunity pipeline, and clearance review.',
  },
  tasklytic: {
    tagline: 'Connect the plan to the work and the billing.',
    description: 'Manage projects, people, and deadlines alongside time, expenses, and invoices. Give each engagement a shared home, from the first intake form to delivery and reporting.',
    capabilities: ['List, board, calendar, timeline, and Gantt views', 'Intake forms, automation rules, goals, and workload planning', 'Timesheets, expenses, invoicing, and delivery dashboards'],
    useCase: 'Client engagements, recurring projects, and team coordination.',
    graphic: 'projects',
    graphicLabel: 'An engagement board organizes assigned tasks into planned work, review, and completed work.',
    guideHref: '/docs/tasklytic/overview',
  },
  chrona: {
    tagline: 'Reconstruct your day without starting a timer.',
    description: 'Chrona uses desktop activity captures and AI to build a searchable work timeline on Mac and Windows. Review your day, then sync timeline summaries to the firm dashboard for time reporting.',
    capabilities: ['Automatic activity timelines with summaries and categories', 'Personal review, Ask chat, and a work journal', 'Device pairing, firm-wide time reporting, and CSV exports'],
    useCase: 'Reconstructing client work and understanding where team time goes.',
    graphic: 'time',
    graphicLabel: 'A workday timeline groups activity into client work, research, and review for time reporting.',
    guideHref: '/docs/chrona/overview',
  },
  'cpe-tracker': {
    tagline: 'Less certificate filing. More learning.',
    description: 'Turn continuing professional education documents into an organized tracker. Choose a state template, upload your certificates, and review extracted details in an editable sheet, at no cost.',
    capabilities: ['State-specific templates for CPE tracking', 'Certificate uploads and AI extraction into editable rows', 'Downloadable spreadsheets for your records'],
    useCase: 'Organizing course completions and professional education records.',
    graphic: 'learning',
    graphicLabel: 'Course certificates become an editable CPE sheet with course, date, and credit fields.',
  },
  'analytics-suite': {
    tagline: 'Turn accounting data into reviewable analysis.',
    description: 'Bring variance analysis, reconciliation, schedules, and research into one firm workspace. Upload source data, investigate exceptions, and prepare outputs your team can review and deliver.',
    capabilities: ['Variance and flux explanations with supporting memos', 'Transaction matching, fixed assets, and revenue waterfalls', 'IRS and GAAP research with a context-aware AI assistant'],
    useCase: 'Monthly close, reconciliations, accounting schedules, and research.',
    graphic: 'analytics',
    graphicLabel: 'Actual and budget comparisons highlight a variance alongside transaction reconciliation status.',
    guideHref: '/docs/ai-analytics-suite/overview',
  },
  taxatlas: {
    tagline: 'Follow the jurisdictions that matter to you.',
    description: 'Explore global tax rates, regulations, court decisions, and tariffs in one research workspace. Use source links, effective dates, and confidence markers to investigate changes before applying them to your work.',
    capabilities: ['Interactive map and country or sub-national profiles', 'Change feeds and watchlists for selected jurisdictions', 'Source-backed records, data exports, and delivery channels'],
    useCase: 'Cross-border tax research and monitoring regulatory changes.',
    graphic: 'tax',
    graphicLabel: 'A globe connects jurisdiction research to source records and a monitored-change feed.',
    guideHref: '/docs/taxatlas/overview',
  },
}
