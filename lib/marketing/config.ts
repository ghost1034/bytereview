import type { SubscriptionPlan } from '@/hooks/useBilling'

export type MarketingLink = {
  label: string
  href: string
  description?: string
}

export const protectedDestinations = {
  formFill: '/dashboard/form-fill',
  inkwise: '/dashboard/inkwise',
  tasklytic: '/dashboard/project-management',
  pbc: '/dashboard/pbc',
  esign: '/dashboard/esign',
  analytics: '/dashboard/analytics',
} as const

export const productLinks: MarketingLink[] = [
  { label: 'Universal Document Analysis', href: '/features', description: 'AI extraction & automations' },
  { label: 'CPE Tracker', href: '/#document-analysis', description: 'Track continuing professional education' },
  { label: 'Form Fill', href: '/#form-fill', description: 'AI form filling from your documents' },
  { label: 'Inkwise', href: '/#inkwise', description: 'AI writing with citations' },
  { label: 'E-Signature', href: '/#e-signature', description: 'Send, sign, and verify documents' },
  { label: 'Chrona', href: '/#chrona', description: 'AI time tracking' },
  { label: 'Claw Series', href: '/claw', description: 'AI digital workers' },
  { label: 'AI Analytics Suite', href: '/#ai-analytics', description: 'Variance, reconciliation, fixed assets & research bots' },
  { label: 'Tasklytic', href: '/#tasklytic', description: 'Projects, tasks, forms, time, reporting & AI' },
  { label: 'Prepared by Client (PBC)', href: '/#pbc', description: 'Secure client evidence collection and review' },
]

export const consultingLinks: MarketingLink[] = [
  { label: 'Forward-Deployed Consulting', href: '/consulting', description: 'Embedded teams that ship custom AI' },
  { label: 'LLM Governance', href: '/consulting/llm-governance', description: 'AI policy, risk tiers & approval workflows' },
]

export const footerGroups = [
  { title: 'Products', links: productLinks },
  { title: 'Resources', links: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Demo', href: '/demo' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Case study', href: '/case-study/LFO' },
  ] },
  { title: 'Company', links: [
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ] },
  { title: 'Legal', links: [
    { label: 'Privacy policy', href: '/privacy' },
    { label: 'Terms of service', href: '/terms' },
  ] },
] satisfies Array<{ title: string; links: MarketingLink[] }>

export type DemoVideo = {
  title: string
  url: string
  group: 'Document analysis' | 'Form Fill' | 'Inkwise' | 'E-Signature' | 'Chrona' | 'Claw Series'
  description?: string
}

export const demoVideos: DemoVideo[] = [
  { title: 'Build P&L in 2 Minutes', url: 'https://www.youtube-nocookie.com/embed/tNwpajJZ8zA?si=y6cb2ZD7I42YRXND', group: 'Document analysis' },
  { title: 'Free CPE Tracker', url: 'https://www.youtube-nocookie.com/embed/gchB4SbxsJM?si=KlJMFOjH0nKP08yX', group: 'Document analysis' },
  { title: 'Bank Statement Analysis', url: 'https://www.youtube-nocookie.com/embed/mxDEliIRWtc?si=brPvZMmN0F5Tbeeh', group: 'Document analysis' },
  { title: 'Invoice Extraction and Contract Review', url: 'https://www.youtube-nocookie.com/embed/uWA5ds9VuPM?si=DxjCBqrxZ997eF5A', group: 'Document analysis' },
  { title: 'Email and Google Drive Automations', url: 'https://www.youtube-nocookie.com/embed/R0ubnn4ggGA?si=XZ6cP69kg5JqebIT', group: 'Document analysis' },
  { title: 'Automatically Fill Any PDF or Word Document with AI', url: 'https://www.youtube-nocookie.com/embed/Jgv9cP-vT1Y?si=KwxAjrizEe8H95Ab', group: 'Form Fill' },
  { title: 'Write a Professional Investor Report in Minutes with AI', url: 'https://www.youtube-nocookie.com/embed/OaloCO7Bh28?si=sx0_nt3OfuYFJL5u', group: 'Inkwise' },
  { title: 'Write a Legal Complaint Faster with AI', url: 'https://www.youtube-nocookie.com/embed/pNpDUlNZuuU?si=AHTVSvVUEriqK6db', group: 'Inkwise' },
  { title: 'Write a Robust Academic Article with 70+ References Using AI', url: 'https://www.youtube-nocookie.com/embed/qmFBxibcals?si=-Sq1Lr-AgZDPg5pC', group: 'Inkwise' },
  { title: 'Generate Accurate Academic & Legal Citations with AI', url: 'https://www.youtube-nocookie.com/embed/zloKYPE0Vjw?si=-d18M7b5fcLCNIpn', group: 'Inkwise' },
  { title: 'How Inkwise Prevents AI Hallucinations with RAG', url: 'https://www.youtube-nocookie.com/embed/e5rytCGzzec?si=mKhaxCQx47ZkqvVE', group: 'Inkwise' },
  { title: 'Send & Sign PDFs for Free with CPAAutomation eSign', url: 'https://www.youtube-nocookie.com/embed/QnpKCSrOGB8?si=xJb4z11uPwQjk-we', group: 'E-Signature' },
  { title: 'Track Billable Hours Automatically with AI', url: 'https://www.youtube-nocookie.com/embed/QNCVh1SKS9A?si=75hUo0Zm1r4p3vh5', group: 'Chrona' },
  { title: 'AccountingClaw Preview', url: 'https://www.youtube-nocookie.com/embed/976yIJsO1cA?si=82I14R9fUPznZX1E', group: 'Claw Series', description: 'AI digital workers that perform accounting tasks autonomously.' },
  { title: 'Dual Agent Technical Accounting Memo', url: 'https://www.youtube-nocookie.com/embed/hePBTs8MnFQ?si=exJDcDO07KvjXkb4', group: 'Claw Series', description: 'Two AI agents collaborate to solve a technical accounting problem through structured reasoning.' },
  { title: 'AI Skill for Browser Automation', url: 'https://www.youtube-nocookie.com/embed/939uCq5jxN0?si=77c9Gr7DVJiHKlnx', group: 'Claw Series', description: 'Automatically download a NetSuite report with SOX- and audit-compliant screenshots.' },
  { title: 'Automate Universal Document Analysis with AccountingClaw', url: 'https://www.youtube-nocookie.com/embed/w4HB7m8XEUQ?si=uRfMqGNsH4QB0NfC', group: 'Claw Series', description: 'Use AccountingClaw to analyze documents and automate downstream accounting work.' },
  { title: 'Get Your AI Digital Workers on Slack', url: 'https://www.youtube-nocookie.com/embed/bnB6fy3KaA4?si=ohJRMwlzhhYspOSz', group: 'Claw Series', description: 'Bring AI digital workers into Slack so your team can delegate work where it already collaborates.' },
]

export type ClawProduct = {
  id: 'accounting' | 'legal'
  name: 'AccountingClaw' | 'LegalClaw'
  skills: string
  image: string
  container: string
  volume: string
  port: number
  installer: string
}

export const clawProducts: ClawProduct[] = [
  { id: 'accounting', name: 'AccountingClaw', skills: 'two dozen accounting skills', image: process.env.NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE || 'cpaautomation/accountingclaw-hermes:latest', container: 'accountingclaw', volume: '~/.accountingclaw', port: 8642, installer: 'install-accountingclaw' },
  { id: 'legal', name: 'LegalClaw', skills: '1,251 legal skills across 24 practice areas', image: process.env.NEXT_PUBLIC_LEGALCLAW_IMAGE || 'cpaautomation/legalclaw-hermes:latest', container: 'legalclaw', volume: '~/.legalclaw', port: 8643, installer: 'install-legalclaw' },
]

export function buildClawCommands(product: ClawProduct) {
  return {
    pull: `docker pull --platform linux/amd64 ${product.image}`,
    run: `docker run -d \\\n+  --platform linux/amd64 \\\n+  --name ${product.container} \\\n+  --restart unless-stopped \\\n+  -v ${product.volume}:/opt/data \\\n+  -e CPAA_ACTIVATION_KEY="cpaa_live_..." \\\n+  -e OPENROUTER_API_KEY="sk-or-..." \\\n+  -e API_SERVER_ENABLED=true \\\n+  -e API_SERVER_HOST=0.0.0.0 \\\n+  -e API_SERVER_KEY="change-this-api-key" \\\n+  -p 127.0.0.1:${product.port}:8642 \\\n+  ${product.image} gateway run`,
    verify: `docker logs -f ${product.container}\ndocker exec -it ${product.container} hermes status\ndocker exec -it ${product.container} hermes skills list\ndocker exec -it ${product.container} hermes chat`,
    alias: `alias hermes='docker exec -it ${product.container} hermes'`,
    desktopUnix: `curl -fsSL https://cpaautomation.ai/${product.installer}.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash`,
    desktopWindows: `$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/${product.installer}.ps1 -UseBasicParsing | iex`,
  }
}

const knownPlans = {
  free: { name: 'Free', description: 'Get started for free', price: 'Free' },
  basic: { name: 'Basic', description: 'For individuals and small teams', price: '$9.99/month' },
  pro: { name: 'Pro', description: 'For growing finance teams', price: '$49.99/month' },
} as const

export function presentPlan(plan: SubscriptionPlan) {
  const code = plan.code.toLowerCase()
  const known = knownPlans[code as keyof typeof knownPlans]
  return known ?? { name: plan.display_name, description: 'Flexible plan', price: null }
}

export function formatLimit(value: number, noun: string) {
  if (value < 0) return `Unlimited ${noun}s per month`
  return `${value.toLocaleString('en-US')} ${noun}${value === 1 ? '' : 's'} per month`
}

export function formatAutomationLimit(value: number) {
  if (value < 0) return 'Unlimited automations'
  return `Up to ${value.toLocaleString('en-US')} automation${value === 1 ? '' : 's'}`
}

export function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value / 100)
}
