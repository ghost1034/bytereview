import PublicPricing from '@/components/public-site/pages/pricing'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.pricing)

export default function PricingPage() {
  return <PublicPricing />
}
