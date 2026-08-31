import { PublicFeatures } from '@/components/public-site/pages/marketing-pages'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.features)

export default function FeaturesPage() {
  return <PublicFeatures />
}
