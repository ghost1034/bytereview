'use client'

import { useState } from 'react'
import { buildClawCommands, clawProducts } from '@/lib/marketing/config'

function CodeCard({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return <section className="ps-code-card"><header><span>{title}</span><button type="button" onClick={() => void copy()} aria-label={`Copy ${title}`}>{copied ? 'Copied.' : 'Copy'}</button></header><pre><code>{code}</code></pre></section>
}

export function ClawInstaller() {
  const [productId, setProductId] = useState<'accounting' | 'legal'>('accounting')
  const [mode, setMode] = useState<'cloud' | 'desktop'>('cloud')
  const product = clawProducts.find((item) => item.id === productId) ?? clawProducts[0]
  const commands = buildClawCommands(product)

  return <div>
    <div className="ps-claw-tabs" role="tablist" aria-label="Claw product"><button type="button" role="tab" aria-selected={productId === 'accounting'} onClick={() => setProductId('accounting')}>AccountingClaw</button><button type="button" role="tab" aria-selected={productId === 'legal'} onClick={() => setProductId('legal')}>LegalClaw</button></div>
    <div className="ps-claw-tabs" role="tablist" aria-label="Deployment mode"><button type="button" role="tab" aria-selected={mode === 'cloud'} onClick={() => setMode('cloud')}>Cloud digital workers</button><button type="button" role="tab" aria-selected={mode === 'desktop'} onClick={() => setMode('desktop')}>Desktop digital workers</button></div>
    {mode === 'cloud' ? <div role="tabpanel">
      <div className="ps-section-head"><div><h2>Run {product.name} in your cloud with Docker</h2></div><p>Pull the verified {product.name} Docker image and run it with your personal CPAAutomation.ai activation key plus your OpenRouter key. The image includes {product.skills} encrypted inside the container and installs them into your persistent Hermes data volume on first startup. Ideal for AWS, GCP, Azure, or your own VPC.</p></div>
      <div className="ps-button-row"><a className="ps-button ps-button--light" href="/dashboard/activation">Get your activation key</a><a className="ps-link" href="/contact">Contact us for a code.</a></div>
      <div className="ps-code-stack">
        <div><h3>Pull the image</h3><p className="ps-muted">Use the public {product.name} Hermes image. The platform flag supports Apple Silicon and other ARM hosts via Docker emulation.</p><CodeCard title="Pull the image" code={commands.pull} /></div>
        <div><h3>Run locally or on your server</h3><p className="ps-muted">Mount <code>/opt/data</code> so Hermes sessions and installed skills persist across container restarts. The API server is bound to localhost.</p><CodeCard title="Run locally or on your server" code={commands.run} /></div>
        <div><h3>Use Hermes after it starts</h3><p className="ps-muted">The hermes command runs inside the container. Use docker exec to verify the install, list skills, and open chat.</p><CodeCard title="Use Hermes after it starts" code={commands.verify} /></div>
        <div><h3>Optional host shortcut</h3><p className="ps-muted">Add this shell alias if you want to type hermes from your host terminal while the container is running.</p><CodeCard title="Optional host shortcut" code={commands.alias} /></div>
      </div>
      <h3>What to do next</h3><p className="ps-muted">After the container starts, run the commands above. If your terminal says <code>hermes: command not found</code>, run Hermes through <code>docker exec</code> or add the alias. The local API is available on <code>http://127.0.0.1:{product.port}</code> only when <code>API_SERVER_ENABLED</code>, <code>API_SERVER_HOST</code>, and <code>API_SERVER_KEY</code> are set.</p>
      <div className="ps-note-grid">{[['Encrypted skills included',`Each Claw ships its skills inside the public linux/amd64 image as an encrypted bundle.`],['Activation key required','The encrypted profile installs only when your personal CPAA_ACTIVATION_KEY is provided. The same key unlocks AccountingClaw and LegalClaw — get it from the Activation page.'],['Persistent agent data','Hermes profile data, sessions, and installed skills live in the mounted /opt/data volume.'],['OpenRouter key if desired','Hermes uses OpenRouter by default, so pass OPENROUTER_API_KEY with your model access key.']].map(([a,b])=><article key={a}><strong>{a}</strong><p>{b}</p></article>)}</div>
    </div> : <div role="tabpanel">
      <div className="ps-section-head"><div><h2>Run {product.name} on your desktop</h2></div><p>Install the official Hermes Desktop app, then add the {product.name} skills with one command and your personal activation key. Everything runs locally on your machine — no Docker required.</p></div>
      <div className="ps-button-row"><a className="ps-button ps-button--light" href="https://hermes-assets.nousresearch.com/Hermes-Setup.dmg">Hermes Desktop for Mac</a><a className="ps-button ps-button--outline" href="https://hermes-assets.nousresearch.com/Hermes-Setup.exe">Hermes Desktop for Windows</a><a className="ps-link" href="/dashboard/activation">Get your activation key</a><a className="ps-link" href="/contact">Contact us for a code.</a></div>
      <div className="ps-code-stack">
        <div><h3>1. Install Hermes Desktop</h3><p className="ps-muted">Download the app for Mac or Windows with the buttons on the left. On Linux, install Hermes with the official terminal one-liner.</p><CodeCard title="Linux installer" code="curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash" /></div>
        <div><h3>2. Install {product.name} (macOS / Linux)</h3><p className="ps-muted">Replace <code>cpaa_live_...</code> with your personal activation key from the Activation page. The installer verifies and installs the skills into your local Hermes home.</p><CodeCard title={`${product.name} · macOS / Linux`} code={commands.desktopUnix} /></div>
        <div><h3>2. Install {product.name} (Windows PowerShell)</h3><p className="ps-muted">Replace <code>cpaa_live_...</code> with your personal activation key from the Activation page, then run in PowerShell.</p><CodeCard title={`${product.name} · Windows PowerShell`} code={commands.desktopWindows} /></div>
      </div>
      <h3>What to do next</h3><p className="ps-muted">Launch Hermes Desktop and complete its onboarding (it connects your AI model provider in-app). Then open the Skills pane — the {product.name} skills are ready to use. CLI check: <code>hermes skills list</code>.</p>
      <div className="ps-note-grid">{[['Official Hermes Desktop app','Runs on the native Hermes Desktop app for macOS, Windows, and Linux — same agent, chat UI included.'],['Activation key required','The installer downloads the skills only with a valid personal CPAA_ACTIVATION_KEY. The same key unlocks AccountingClaw and LegalClaw — get it from the Activation page.'],['Local agent data','Skills, sessions, and config live in your Hermes home (~/.hermes on macOS/Linux, %LOCALAPPDATA%\\hermes on Windows).'],['Model configured in-app','Hermes Desktop walks you through connecting your AI model provider during onboarding — no env vars needed.']].map(([a,b])=><article key={a}><strong>{a}</strong><p>{b}</p></article>)}</div>
    </div>}
  </div>
}
