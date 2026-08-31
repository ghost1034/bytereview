import { PublicSiteLayout } from '@/components/public-site/site-layout'
import './public-site.css'

interface MarketingLayoutProps {
  children: React.ReactNode
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return <PublicSiteLayout>{children}</PublicSiteLayout>
}
