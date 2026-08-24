import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'
import './marketing.css'

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <a className="ps-skip" href="#main-content">Skip to content</a>
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  )
}
