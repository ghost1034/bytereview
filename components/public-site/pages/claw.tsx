'use client'

import { useState } from 'react'
import { Bot, BrainCircuit, Check, Cloud, Copy, Download, HardDrive, KeyRound, Monitor, Scale, ShieldCheck } from 'lucide-react'

import { PageHero, Reveal, SectionHeading, SiteButton } from '../ui'

interface Product {
  key: string
  name: string
  blurb: string
  image: string
  container: string
  volume: string
  port: number
  installer: string
}

const PRODUCTS: Product[] = [
  { key: 'accountingclaw', name: 'AccountingClaw', blurb: 'two dozen accounting skills', image: process.env.NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE || 'cpaautomation/accountingclaw-hermes:latest', container: 'accountingclaw', volume: '~/.accountingclaw', port: 8642, installer: 'install-accountingclaw' },
  { key: 'legalclaw', name: 'LegalClaw', blurb: '1,251 legal skills across 24 practice areas', image: process.env.NEXT_PUBLIC_LEGALCLAW_IMAGE || 'cpaautomation/legalclaw-hermes:latest', container: 'legalclaw', volume: '~/.legalclaw', port: 8643, installer: 'install-legalclaw' },
]

function commands(product: Product, mode: 'cloud' | 'desktop') {
  if (mode === 'desktop') return [
    ['Install Hermes on Linux', 'Official one-line Hermes installer.', 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'],
    [`Install ${product.name} on macOS / Linux`, 'Replace the placeholder with your activation key.', `curl -fsSL https://cpaautomation.ai/${product.installer}.sh | CPAA_ACTIVATION_KEY="cpaa_live_..." bash`],
    [`Install ${product.name} on Windows`, 'Run from PowerShell with your activation key.', `$env:CPAA_ACTIVATION_KEY="cpaa_live_..."; iwr https://cpaautomation.ai/${product.installer}.ps1 -UseBasicParsing | iex`],
  ]
  const run = ['docker run -d \\', '  --platform linux/amd64 \\', `  --name ${product.container} \\`, '  --restart unless-stopped \\', `  -v ${product.volume}:/opt/data \\`, '  -e CPAA_ACTIVATION_KEY="cpaa_live_..." \\', '  -e OPENROUTER_API_KEY="sk-or-..." \\', '  -e API_SERVER_ENABLED=true \\', '  -e API_SERVER_HOST=0.0.0.0 \\', '  -e API_SERVER_KEY="change-this-api-key" \\', `  -p 127.0.0.1:${product.port}:8642 \\`, `  ${product.image} gateway run`].join('\n')
  return [
    ['Pull the image', 'Public linux/amd64 Hermes image.', `docker pull --platform linux/amd64 ${product.image}`],
    ['Run the digital worker', 'Persistent local data and localhost-only API binding.', run],
    ['Verify and start chat', 'Inspect logs, skills, and launch the Hermes CLI.', `docker logs -f ${product.container}\ndocker exec -it ${product.container} hermes status\ndocker exec -it ${product.container} hermes skills list\ndocker exec -it ${product.container} hermes chat`],
    ['Optional shell alias', 'Run Hermes from the host terminal.', `alias hermes='docker exec -it ${product.container} hermes'`],
  ]
}

function Command({ title, description, command }: { title: string; description: string; command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return <div className="ps-command"><div><span><strong>{title}</strong><small>{description}</small></span><button type="button" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</button></div><pre><code>{command}</code></pre></div>
}

export default function PublicClaw() {
  const [productKey, setProductKey] = useState(PRODUCTS[0].key)
  const [mode, setMode] = useState<'cloud' | 'desktop'>('cloud')
  const product = PRODUCTS.find((item) => item.key === productKey)!
  return (
    <>
      <PageHero eyebrow="Claw Series" title={<>AI digital workers, <span className="ps-gradient-text">deployed your way.</span></>} description="Run accounting and legal agents in your cloud or on your desktop, with professional skill packages and your choice of model." actions={<><SiteButton href="#install" variant="light">Install a Claw</SiteButton><SiteButton href="/docs/claw-series/overview" variant="ghost">Read the docs</SiteButton></>} />
      <section className="ps-section"><div className="ps-container"><SectionHeading number="001" eyebrow="What Claw does" title="Delegate repeatable professional work to a digital worker." /><div className="ps-value-grid">{[[Bot, 'Domain skills included', 'AccountingClaw and LegalClaw arrive with specialized workflows rather than an empty agent shell.'], [ShieldCheck, 'Your environment', 'Run locally, in your VPC, or in the cloud provider your controls already cover.'], [BrainCircuit, 'Your model choice', 'Connect Anthropic Claude, OpenAI GPT, Google Gemini, or compatible open-source models.']].map(([Icon, title, body], index) => { const CIcon = Icon as typeof Bot; return <Reveal className="ps-value-card" key={title as string}><div className="ps-value-card__top"><span><CIcon /></span><b>0{index + 1}</b></div><h3>{title as string}</h3><p>{body as string}</p></Reveal> })}</div></div></section>
      <section className="ps-section ps-section--soft" id="install"><div className="ps-container"><SectionHeading number="002" eyebrow="Install options" title="Cloud worker or desktop worker. Same professional skills." description="Choose a product and installation target. Commands remain specific to the selected worker." /><div className="ps-claw-tabs" role="tablist" aria-label="Claw product">{PRODUCTS.map((item) => <button type="button" role="tab" aria-selected={productKey === item.key} onClick={() => setProductKey(item.key)} key={item.key}>{item.key === 'legalclaw' ? <Scale /> : <Bot />}{item.name}</button>)}</div><div className="ps-claw-tabs ps-claw-tabs--mode" role="tablist" aria-label="Deployment mode"><button type="button" role="tab" aria-selected={mode === 'cloud'} onClick={() => setMode('cloud')}><Cloud />Cloud digital worker</button><button type="button" role="tab" aria-selected={mode === 'desktop'} onClick={() => setMode('desktop')}><Monitor />Desktop digital worker</button></div><div className="ps-claw-install"><aside><span>{product.name}</span><h2>{mode === 'cloud' ? `Run ${product.name} with Docker` : `Run ${product.name} on your desktop`}</h2><p>{mode === 'cloud' ? `Pull the verified image with ${product.blurb} encrypted inside the container, then unlock it with your activation key.` : `Install the official Hermes Desktop app, then add ${product.name} with one command and your personal activation key.`}</p>{mode === 'desktop' && <div className="ps-claw-downloads"><a href="https://hermes-assets.nousresearch.com/Hermes-Setup.dmg"><Download />Hermes for Mac</a><a href="https://hermes-assets.nousresearch.com/Hermes-Setup.exe"><Download />Hermes for Windows</a></div>}<SiteButton href="/dashboard/activation" variant="light">Get activation key</SiteButton></aside><div className="ps-command-list">{commands(product, mode).map(([title, description, command]) => <Command key={title} title={title} description={description} command={command} />)}</div></div><div className="ps-claw-notes">{[[KeyRound, 'Activation key required', 'The same personal key unlocks AccountingClaw and LegalClaw.'], [HardDrive, 'Persistent agent data', mode === 'cloud' ? 'Sessions and skills live in the mounted /opt/data volume.' : 'Sessions and config remain in your local Hermes home.'], [ShieldCheck, 'Skills included', `${product.name} includes ${product.blurb}.`], [BrainCircuit, 'Model configured by you', mode === 'cloud' ? 'Pass your chosen provider key to the container.' : 'Connect a model provider during Hermes onboarding.']].map(([Icon, title, body]) => { const NIcon = Icon as typeof KeyRound; return <Reveal key={title as string}><NIcon /><div><strong>{title as string}</strong><p>{body as string}</p></div></Reveal> })}</div></div></section>
      <section className="ps-section"><div className="ps-container"><SectionHeading number="003" eyebrow="See it work" title="Digital workers in accounting workflows." /><div className="ps-demo-grid">{[['AccountingClaw Preview', '976yIJsO1cA'], ['Dual Agent Technical Accounting Memo', 'hePBTs8MnFQ'], ['AI Skill for Browser Automation', '939uCq5jxN0']].map(([title, id], index) => <Reveal className={index === 0 ? 'ps-demo-card ps-demo-card--wide' : 'ps-demo-card'} key={id}><div className="ps-video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={title} loading="lazy" allowFullScreen /></div><span>0{index + 1}</span><h3>{title}</h3></Reveal>)}</div></div></section>
    </>
  )
}
