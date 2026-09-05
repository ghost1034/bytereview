import './products.css'
import { PublicFeatures } from '@/components/public-site/pages/products'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.features)

export default function FeaturesPage() {
  return <PublicFeatures />
}
