import { BookOpen, Mic, ShieldCheck } from 'lucide-react'

import {
  SPEECH2WRITE_FILES,
  SPEECH2WRITE_REPOSITORY_URL,
  SPEECH2WRITE_VERSION,
} from '@/lib/speech2write'
import { PageHero, Reveal, SectionHeading, SiteButton } from '../ui'
import DownloadButton from '../speech2write-download-button'

const FEATURES = [
  { icon: Mic, title: 'Speak into your apps', body: 'Use a global hotkey to dictate wherever you write, with a live transcription preview.' },
  { icon: ShieldCheck, title: 'Keep speech on your Mac', body: 'On-device recognition by default. Optional Apple Intelligence text cleanup also runs locally.' },
  { icon: BookOpen, title: 'Make room for your vocabulary', body: 'Add names and specialist terms, or enable vocabulary packs for accounting, finance, law, and more.' },
]

export default function PublicSpeech2Write() {
  return (
    <>
      <PageHero
        eyebrow="Speech2Write · Free & open source"
        title={<>Your voice. <span className="ps-gradient-text">Your words, written.</span></>}
        description="Voice dictation for macOS by CPAAutomation. Turn your next thought into an email, a note, or a draft without breaking your flow."
        actions={<><DownloadButton /><SiteButton href="#install" variant="ghost">How to install</SiteButton></>}
      />
      <section className="ps-section">
        <div className="ps-container">
          <SectionHeading number="001" eyebrow="Meet Speech2Write" title="Less typing. More room to think." description="For Apple Silicon Macs running macOS 15 or later. No CPAAutomation account required." />
          <div className="ps-value-grid">
            {FEATURES.map(({ icon: Icon, title, body }, index) => (
              <Reveal className="ps-value-card" key={title}>
                <div className="ps-value-card__top"><span><Icon aria-hidden /></span><b>0{index + 1}</b></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="ps-section ps-section--soft" id="install">
        <div className="ps-container">
          <SectionHeading number="002" eyebrow={`Install · Version ${SPEECH2WRITE_VERSION}`} title="Start with a download. Then speak." />
          <div className="ps-speech-install">
            <aside>
              <h3>Speech2Write for Mac</h3>
              <p>Apple Silicon · macOS 15+</p>
              <DownloadButton variant="dark" />
              <p>If prompted, allow multiple downloads. Missing a file? Download it below:</p>
              {SPEECH2WRITE_FILES.map((file) => (
                <a key={file.name} className="ps-speech-text-link" href={file.url} download={file.name}>{file.name}</a>
              ))}
            </aside>
            <ol>
              <li><h3>Download all three files</h3><p>Save all three files in one folder. Keep their filenames and leave the ZIP compressed.</p></li>
              <li>
                <h3>Run the installer</h3>
                <p>Open Terminal in that folder and run:</p>
                <pre><code>chmod +x install.sh &amp;&amp; ./install.sh</code></pre>
                <p>The installer verifies and opens the app. This release is not yet Apple-notarized; quarantine is cleared after verification.</p>
              </li>
              <li><h3>Start dictating</h3><p>Allow Microphone and Accessibility access, download the speech model when prompted, then press your dictation hotkey.</p></li>
            </ol>
          </div>
          <p className="ps-speech-attribution">
            Licensed under GPLv3.{' '}
            <a className="ps-speech-text-link" href={SPEECH2WRITE_REPOSITORY_URL}>View source & documentation on GitHub</a>.
          </p>
        </div>
      </section>
    </>
  )
}
