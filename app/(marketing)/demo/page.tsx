import { ProtectedAction } from '@/components/marketing/ProtectedAction'
import { VideoLibrary } from '@/components/marketing/VideoLibrary'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.demo)

export default function DemoPage() { return <main id="main-content">
  <section className="ps-page-hero"><div className="ps-container ps-page-hero__split"><div><span className="ps-label">Demo</span><h1>See CPAAutomation in action</h1></div><p className="ps-kicker">Watch how our products work in real-world accounting, finance, and legal workflows.</p></div></section>
  <section className="ps-section ps-section--muted"><div className="ps-container"><VideoLibrary /></div></section>
  <section className="ps-cta"><div className="ps-container ps-cta__inner"><div><h2>Try CPAAutomation yourself</h2><p>Create a free account to upload documents, connect Gmail or Google Drive, run automations, and see results in your dashboard.</p><div className="ps-supporting"><span>No credit card required</span><span>100 free pages/month</span></div></div><ProtectedAction destination="/dashboard" className="ps-button ps-button--light">Sign up for free</ProtectedAction></div></section>
</main> }
